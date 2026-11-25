# dsh-token-usage

A **token usage view** for DeepSeek Harness, in two seats: a live reading in
the composer row, and a usage overview on the Settings page.

Read-only by default. The single write path is **Delete session** — in the
sidebar Session right-click menu and on each row of the Settings session table —
which also removes that session's token record and stored session files. No
Harness client package is imported.

## What it shows

### 1. The composer row (`conversation.composer.dock`)

Collapsed, one line next to the host's own context ring:

`
▮▮▮ In 3.1k · Cache 41.9k · Out 1.5k · Hit 89.0%
`

Click to expand a detail panel (fixed above the trigger; no portal, no layout
shift):

`
Session token usage
Uncached input      3.1k
Cache read         41.9k
Cache write         2.0k
Output              1.5k
───────────────────────
Cache hit rate     89.0%
───────────────────────
Context usage   ~45.2k / 200k
▬▬▬▬▬░░░░░░░░░░░░░░░░░
22.6%
  System prompt     ~6.1k
  Tool schemas      ~9.4k
  Conversation     ~29.7k
───────────────────────
Refreshed 14:32:07  [Refresh]
`

`Esc` or an outside click closes it; Refresh re-reads the snapshot and
advances the timestamp.

### 2. Sidebar panel entry (`sidebar.panellist` + `main`)

The sidebar's panel list (the Plugins / Skill / Automation-tasks row) gains a
**Token usage** icon that opens a **full page in the main column** - not a modal,
not an overlay.

It uses the same public slots as the shipped Plugins and Automation panels:

- `main` + `key: 'token-usage'` - the page body (`UsagePage`, reusing the very
  same report component as the settings section);
- `sidebar.panellist` + `id: 'token-usage'` - the icon, `order: 40`, with a label
  thunk so it follows the active locale.

Both carry the **same key**: the sidebar routes an entry id to the main cell with
that key, so they are two faces of one feature. A host without either slot loses
only this entry.

### 3. Settings (`settings.section`, nav item "Token usage")

**Summary cards** (three columns, stacking on narrow screens) for this session,
today, and all time - each with the headline total, an in / cache / out detail
line, and the cache hit rate over the selected range.

**Token usage** - a totals line plus a **daily heatmap whose width follows the
real history**: the window spans the Monday of the first recorded week to the
Monday of the latest record, clamped to **8-40 weeks** (~9 months). A nine-week history
gets a nine-week grid instead of a 26-week frame that is 69% empty cells; only a
longer history pages. Monday is the top row and Sunday the bottom row, with four
intensity steps, a per-day tooltip, a month axis and a "less / more" legend.

The intensity scale is normalised over **every** recorded day (with a square-root
ramp), so paging or filtering never re-colours a day you already looked at.
Navigation is **discrete, never a continuous drag**: a short history shows one
caption line, and only a history longer than one window gets
`first / prev / page n of m / next / latest` buttons - the way Codex and Claude
switch a fixed usage range.

**Usage detail (grouped, with shares)** - two dimension tabs (**by model / by
session**), one row per value with input / cache / output / total plus a **share
bar** of the selected range's total. Heaviest first, eight rows, with a "show
all" toggle.

> A workspace dimension was tried and **removed**: the session list row the
> client receives carries no `cwd` (the host publishes only
> `sessionListMetadata`: `blank` + `lastPromptAt`), so every row fell into one
> anonymous group reading "100%". A dimension that cannot be resolved is worse
> than no dimension.
>
> The delete action only appears on the **by session** dimension.

**Relative baselines (no billing)** - a raw token count cannot say whether it is
a lot, so today is framed as `12.3M · 126%` against the mean of the preceding
seven full days (`vs 9.8M daily avg`), amber at 115%+ and blue at 85%-. The
sidebar card carries the same line plus the cache hit rate - Claude's
"number plus reference" framing, still in tokens.

### Accounting (identical to the harness)

- The four buckets are **disjoint**; `outputTokens` already includes
  reasoning tokens and is not counted twice.
- Hit rate = `cache read / (uncached input + cache read + cache write)`.
  Cache writes belong in the denominator but are not hits.
- Context occupancy is **provider-anchored**; the composition figures are
  **heuristic estimates**. The two are deliberately not equal, so every
  estimate carries a tilde.
- Progress bars and figures warn at 75% (amber) and 90% (red).

## Where the data comes from

Everything the harness already publishes is read; nothing is computed twice.

| Data | Source |
|---|---|
| This session's four token buckets | session projection `tokenUsage` |
| Context occupancy | session projection `contextPressure` |
| Context composition | session projection `contextBreakdown` |
| Cross-session totals, heatmap, table | each session's `projectionValues.tokenUsage` in the client session list (`ctx.sessions.list`) |

### Archived sessions are excluded

Archiving a session (the archive row in the session menu) puts it away: the
sidebar stops showing it, and this page stops counting it. Restoring it brings it
back immediately. This is the harness's own reversible mechanism.

**Delete session.** Each row of the Settings session table carries a Delete
button. It removes that session's directory under `~/.dsh/sessions/` (the token
history is folded from that log, so it disappears with it), detaches the session
from its Workspace, clears archive/pin state, and drops the plugin's
`localStorage` ledger entry. The route is registered only when the host exposes
`connection.fetch`; a running conversation is refused until its turn ends, and a
locked file asks you to restart the harness. **Irreversible; no undo.**

### Attribution to a calendar day

The heatmap answers "which day did these tokens go to". The exact answer lives in
the session event log, which the host half folds by day (see above). When that
projection is absent - an old session the host never loaded - the plugin falls
back to the rules below, and says so:

1. **First choice: the `tokenUsageByDay` projection the host publishes.** It is the
   event log folded by day, so it is **exact**. Present for every session the host
   has loaded; absent for an old session that was never opened (a new key never
   appears in the persisted projection cache).
2. **When it is absent, an approximation**, by these rules:
   - **Only the prompt stamp counts** (`sessionListMetadata.lastPromptAt`).
     **`updatedAt` / `lastActivityAt` / `at` are never consulted** - they are read and
     activity stamps.
   - Per-day amounts come from **observed growth only**: the plugin remembers the
     last total it saw per session and credits the difference to the day it saw it.
   - **Usage that already existed at first sight** goes on the session's **last
     prompt day** (so history survives) but **never on today** - how much of it is
     today's cannot be told, and today is the figure that must not be inflated.
     What cannot be placed is reported on its own line under the heatmap.
3. The ledger is **persisted in `localStorage`** (key `dsh-token-usage.spend.v3`):
   browser-local, **no RPC, no host write, no file**. Only the last 200 days are
   kept. Sessions are deliberately **not** dropped for being absent from the
   list - it can be blank while loading, or scoped to one workspace, and
   forgetting a session there destroys its whole attribution (a hazard found by
   testing).
   testing).

**In practice:**

- A session the host has loaded: **every day is the real number** (measured on a
  real session: 10-08 = 193.1M, 10-09 = 50.1M).
- An old session that was never opened: the approximation above, with its
  carried-over share listed explicitly.
- **A restart loses nothing:** the ledger is read back and grows from there.

> An earlier version placed the backlog on the session's last prompt day. That
> wrote a guess into the ledger permanently: continuing yesterday's conversation
> once put its entire history into Today forever. It no longer guesses.
The host half (`lib/index.js`) **registers one session projection** that folds the
session event log into per-day buckets:

`js
ctx.inject(['sessionProjections'], (scoped) => scoped.sessionProjections.register({
  key: 'tokenUsageByDay',
  apply: (state, event) => { /* bucket event.data.usage by event.time */ },
  wire: { view: (state) => state },   // { '2026-10-08': {...}, '2026-10-09': {...} }
}))
`

**Why it is needed:** every settled assistant message carries its own usage *and*
the wall-clock time it settled - when tokens were spent exists only in that log.
The `tokenUsage` projection the harness already publishes folds it into one
cumulative total, so a list row says how much a session ever spent and nothing
about when.

It is a **pure fold**: reads no file, writes no file, opens no port, makes no
call. The client reads the result through the platform's own projection pipeline.

> The dependency is **optional** (`ctx.inject`, not `export const inject`): a future
> harness that moves or renames the seam costs only the per-day breakdown - the
> plugin still loads and the client falls back to its own approximation.

## Install

**Use the Desktop-bundled CLI.** The global `dsh` cannot manage the
`desktop` profile:

- `dsh --dump-config --profile desktop` fails outright (it cannot
  resolve bundles that ship only inside the Desktop archive);
- the Desktop build rejects `desktop` unconditionally on the boot/dump
  path (`dsh/lib/bin.js:112`) and only permits it for the `plugin`
  subcommand under `manageDesktopProfile`, which is exactly how
  `dsh-desktop-host/lib/cli.js` calls it.

`powershell
$env:ELECTRON_RUN_AS_NODE = '1'
$exe = "D:\DeepSeek harness\DeepSeek Harness.exe"
$cli = "D:\DeepSeek harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js"
& $exe --expose-internals $cli plugin --profile desktop add github:gongstudent/dsh-token-usage
`

The install **automatically** appends this package to
`dsh.profile.bundles`; no profile file needs editing.

To install from a local checkout instead, pass its absolute path: the
dependency then becomes a `link:` and source edits take effect
immediately. To upgrade a `github:` install, run `add` again - it is
pinned to a commit and will not follow the branch silently.

**The host then has to recompose its Loader tree.** A newly added bundle is not
guaranteed to be picked up by HMR; if it does not appear, restart the Desktop
app.

To remove it, swap `add` for `remove dsh-token-usage`.

## Development

`bash
pnpm test         # static gates + behavioural tests
pnpm check        # static gates only
pnpm sync-tokens  # regenerate the theme-token allowlist from a live DSH
`

Three static gates (`scripts/check.mjs`):

1. **The zh and en key sets must be exactly equal** (placeholder sets too).
2. **Every `--dsw-*` the stylesheet uses must be allowlisted, and every
   `var()` must carry a literal fallback.**
3. **Every file stays at or under 262144 bytes** (the DSH STORE per-file bound).

The behavioural suite (`test/verify.mjs`) runs the real bundle against a
fake DOM, a fake React and a fake context, asserting one by one that a missing
host facility still costs nothing.

## Forward compatibility

This is the plugin's primary design constraint. The rules and their evidence:

| Rule | Why |
|---|---|
| Use `slots.inject`, never `slots.register` | `register` throws on an undeclared slot; `inject` simply never runs |
| A missing projection renders nothing, never throws | `useProjection` resolves unknown keys to `undefined` (the renderer does `source(key) ?? absentSource`) |
| Declare `locale` in the slot options only when a locale service exists | Declaring `entry.locale` without a locale face throws `SlotAssemblyError` **during assembly**, and assembly errors pierce the platform's per-entry isolation |
| Wrap the readout in its own error boundary | On failure it renders `null` instead of leaving a host error placeholder in the composer |
| Every `var(--dsw-*)` carries a literal fallback | A removed variable makes `var()` fall back to nothing, invalidating the whole declaration |
| `dsh.compatibility` states a floor only | No upper bound to go stale |

**Troubleshooting** - if the plugin is installed but invisible:

1. That is the **intended silent degradation**. The host may have renamed the
   `conversation.composer.dock` seat or the `tokenUsage`
   projection. Neither case raises an error.
2. Open DevTools and look for diagnostics prefixed with
   `[dsh-token-usage]`.
3. Run `pnpm check` to confirm the package itself is intact.

## License

MIT
