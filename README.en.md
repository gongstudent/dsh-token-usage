# dsh-token-usage

A **token usage view** for DeepSeek Harness, in two seats: a live reading in
the composer row, and a usage overview on the Settings page.

Read-only. No persistence. No host-side logic. No Harness client package is
imported.

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

### 2. Settings (`settings.section`, nav item "Token usage")

**Summary cards** (three columns, stacking on narrow screens) for this session,
today, and all time - each with the headline total and an in / cache / out
detail line.

**Token usage** - a totals line plus a **26-week daily heatmap** that fills the
settings width, with four intensity steps, a per-day tooltip, a month axis and
a "less / more" legend.

**By session** - session, input tok, cache tok, output tok, total tok; newest
first, capped at 20 rows.

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

### Attribution to a calendar day

The heatmap answers "which day did these tokens go to", but the session list
publishes only a cumulative total and one timestamp. So the rule is explicit:

1. **Only the prompt stamp counts** - `sessionListMetadata.lastPromptAt`.
   **`updatedAt` / `lastActivityAt` / `at` are never consulted**: they are
   read/activity stamps that move when a session is merely *opened*. An earlier
   version used them as fallbacks, so opening an old conversation the next day
   re-dated its entire history onto today.
2. **A session is attributed to a day only when its whole life fits that day**
   (`header.createdAt` and `lastPromptAt` on the same date). That case is exact.
3. **A multi-day session cannot be attributed.** Its per-day split is not
   published anywhere a client can read (the `tokenUsage` projection's wire view is
   only `totals`). Rather than dump the whole total onto whichever day happens to
   be its last, the plugin reports it separately: it is excluded from the
   calendar and from Today, and the section shows "a further N tokens come from
   M multi-day sessions". Those table rows are marked **multi-day**.
4. A session with no timestamp at all stays out of the calendar but still
   counts toward every total.

> **Why no per-turn split:** the client `sessions` service exposes only the list
> snapshot, not the session event log (per-turn `usage` plus `event.time` live
> there, on the host side). The reference implementation `dsh-cost-meter` gets this
> right with a **persisted host-side ledger** (`turn-cost.js` / `backfill.js`); this
> plugin deliberately persists nothing and issues no RPC.

There is **no host half**. `lib/index.js` is an empty Cordis plugin.
Its only reason to exist: the client module system composes its browser boot
graph by scanning **enabled** Loader entries, so a package needs a loadable
host row before its `dsh.client` declaration becomes a bundle.

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
