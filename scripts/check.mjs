#!/usr/bin/env node
/**
 * Static gates for dsh-token-usage.
 *
 * Three independent assertions, each of which has caught a real defect in the
 * reference plugin this design was distilled from:
 *
 *   1. Dictionary parity - the zh and en tables must declare EXACTLY the same
 *      key set. The reference ships 514/514 by hand and has no gate for it, so
 *      a one-sided key would ship silently.
 *   2. Token whitelist - every --dsw-* custom property the stylesheet uses
 *      must be a name the platform actually defines. The reference uses five
 *      names that no longer exist upstream.
 *   3. Size bound - every shipped file stays under the DSH STORE per-file
 *      limit of 262144 bytes.
 *
 * @module dsh-token-usage/scripts/check
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = process.env.TU_BUNDLE ?? join(root, 'lib', 'client.js')
const SIZE_BOUND = 262144

/** Load the browser bundle in a minimal fake DOM and return what it exposes. */
function loadBundle() {
  const styles = []
  const document = {
    head: { appendChild: (node) => styles.push(node) },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  let definition
  vm.runInNewContext(readFileSync(BUNDLE, 'utf8'), {
    window: { __ModuleLoader__: { load: (value) => { definition = value } } },
    document,
    navigator: { language: 'en' },
    console,
  })
  assert.ok(definition, 'the bundle registers a module with __ModuleLoader__.load')
  assert.equal(definition.id, 'dsh-token-usage', 'module id matches the package name')
  // The bundle subclasses React.Component at factory time, and injects its
  // stylesheet from apply(); the stub covers both.
  const reactStub = {
    Component: class Component { constructor(props) { this.props = props || {} } },
    createElement: () => ({}),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useCallback: (fn) => fn,
  }
  const exported = definition.factory(() => reactStub)
  return { exported, styles }
}

/** Minimal context: apply() only needs a service registry and an effect seat. */
function applyOnce(exported) {
  const ctx = {
    get: () => undefined,
    effect: (fn) => fn(),
  }
  exported.apply(ctx)
}

const { exported, styles } = loadBundle()
applyOnce(exported)

// ---- 1. dictionary parity ----
const messages = exported.__messages
assert.ok(messages, 'the bundle exposes its dictionaries for this gate')
const zh = Object.keys(messages.zh).sort()
const en = Object.keys(messages.en).sort()
assert.deepEqual(zh, en, 'zh and en must declare exactly the same key set')
for (const key of zh) {
  assert.equal(typeof messages.zh[key], 'string', 'zh.' + key + ' is a string')
  assert.equal(typeof messages.en[key], 'string', 'en.' + key + ' is a string')
  assert.ok(messages.zh[key].length > 0 && messages.en[key].length > 0, key + ' is non-empty in both locales')
}
// Placeholder sets must match too, or one locale silently drops a value.
const placeholders = (text) => [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort()
for (const key of zh) {
  assert.deepEqual(placeholders(messages.zh[key]), placeholders(messages.en[key]),
    key + ' uses the same placeholders in both locales')
}
console.log('[ok] dictionary parity: ' + zh.length + ' keys, identical in zh and en')

// ---- 2. token whitelist ----
assert.equal(styles.length, 1, 'exactly one stylesheet is injected')
const css = styles[0].textContent
const known = new Set(JSON.parse(readFileSync(join(root, 'scripts', 'tokens.snapshot.json'), 'utf8')).names)
const used = [...new Set([...css.matchAll(/--dsw-[a-z0-9-]+/g)].map((m) => m[0]))].sort()
assert.ok(used.length > 0, 'the stylesheet uses platform tokens')
const unknown = used.filter((name) => !known.has(name))
assert.deepEqual(unknown, [], 'unknown platform tokens: ' + unknown.join(', '))
// Every var() reference must carry a literal fallback, so a token that
// disappears upstream degrades instead of invalidating the declaration.
const bare = [...css.matchAll(/var\((--dsw-[a-z0-9-]+)\)/g)].map((m) => m[1])
assert.deepEqual([...new Set(bare)], [], 'every var(--dsw-*) needs a literal fallback: ' + [...new Set(bare)].join(', '))
console.log('[ok] token whitelist: ' + used.length + ' platform tokens used, all known, all with fallbacks')

// ---- 2b. every message key the bundle renders must exist in the dictionaries ----
// A key removed from MESSAGES but still referenced renders as the raw key text
// on screen, which is exactly how a stale 'costUnpriced' reached the UI once.
const referenced = new Set([...readFileSync(BUNDLE, 'utf8').matchAll(/\bt\('([A-Za-z][A-Za-z0-9]*)'/g)].map((match) => match[1]))
assert.ok(referenced.size > 0, 'the bundle references at least one message key')
const undeclared = [...referenced].filter((key) => !(key in messages.en))
assert.deepEqual(undeclared, [], 'message keys referenced but not declared: ' + undeclared.join(', '))
for (const key of referenced) assert.ok(key in messages.zh, key + ' is missing from zh')
console.log('[ok] message keys: ' + referenced.size + ' referenced, all declared in both locales')

// ---- 2c. audit invariants ----
// color-mix() is decorative only: the four heatmap steps and the spark bars
// carry information, so they use opacity / fill-opacity instead. A new
// color-mix in a data-bearing rule would silently lose its meaning on a
// host engine that does not support the function.
const colorMixUses = [...css.matchAll(/color-mix\(/g)].length
assert.ok(colorMixUses <= 1, 'color-mix must stay decorative-only (found ' + colorMixUses + ' uses)')
if (colorMixUses === 1) {
  assert.ok(/background:var\(--dsw-alias-bg-layer-1[^;]*;background:linear-gradient\(180deg,color-mix\(/.test(css),
    'the one color-mix use must be preceded by a plain background fallback')
}
assert.ok(/\.tu-cell\.l1\{[^}]*opacity:/.test(css) && /\.tu-cell\.l4\{/.test(css),
  'the heatmap intensity steps must not depend on a colour function')
assert.ok(/\.tu-cell\.muted\{[^}]*filter:opacity\(/.test(css),
  'dimming must use filter, so it multiplies with the level opacity instead of overriding it')
console.log('[ok] audit invariants: color-mix stays decorative, intensity is opacity-based')

// Read/activity stamps move when a session is merely opened. Consulting them for
// day attribution re-dates every token a session ever spent onto the day it was
// last looked at, which is exactly the bug this replaced.
const bundleText = readFileSync(BUNDLE, 'utf8')
assert.ok(!/summary\.updatedAt|summary\.lastActivityAt/.test(bundleText),
  'day attribution must never consult read or activity timestamps')
// The list row carries no creation time at all (dsh-api-session-controller
// spreads only parentSessionId/origin/cwd out of the header), so a session's
// cumulative total must never be placed on one day. Per-day amounts come from
// the growth this run observes, and the pre-existing lump lands on the last
// prompt day only.
assert.ok(/function sessionPromptAt/.test(bundleText), 'the prompt stamp stays the only timestamp concept')
assert.ok(/const SPEND = loadSpend\(\)/.test(bundleText), 'observed spending is restored from the previous run')
assert.ok(/function saveSpend\(\)/.test(bundleText), 'observed spending is written back')
assert.ok(/dsh-token-usage\.spend\.v1/.test(bundleText), 'the ledger uses a versioned storage key')
assert.ok(/SPEND_HORIZON_DAYS/.test(bundleText), 'the ledger is bounded by a horizon')
assert.ok(/byDay: recordSpend\(/.test(bundleText), 'each row carries its observed per-day amounts')
assert.ok(/addInto\(bucket\.usage, row\.byDay\[key\]\)/.test(bundleText),
  'the calendar must be built from observed per-day amounts, not from a session total')
assert.ok(!/addInto\(today, row\.usage\)/.test(bundleText),
  'a session total must never be credited to a single day')
console.log('[ok] day attribution: observed growth only, never a cumulative total on one day')

// The client Loader applies a plugin the moment it has no unmet dependency. With
// an empty inject list this bundle applied BEFORE the renderer provided `slots`,
// the guard in apply() found no service and returned, and nothing was ever
// registered - the plugin was silently absent on every fresh boot while looking
// perfectly healthy under HMR. Declaring the dependency is the fix.
assert.ok(/exports\.inject = \['slots'\]/.test(readFileSync(BUNDLE, 'utf8')),
  'the bundle must declare its slots dependency instead of racing the boot order')
assert.ok(/ctx\.inject\(\['sessions'\]/.test(readFileSync(BUNDLE, 'utf8')),
  'the cross-session seats must wait for the session list rather than capture it early')
console.log('[ok] boot ordering: slots and sessions are awaited, never raced')

// The DSH loader only gates on peerDependencies naming @deepseek-ai/dsh*. This
// package imports no host module, so declaring none is what keeps a future
// release from blocking it.
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const peers = Object.keys(manifest.peerDependencies ?? {})
assert.deepEqual(peers, [], 'no peer dependency may gate this package on a DSH version')
assert.ok(typeof manifest.dsh?.bundle?.patch === 'string', 'the bundle patch is declared')
assert.equal(manifest.dsh?.client?.platform, 'web', 'the client half declares the web platform')
console.log('[ok] package contract: no version-gating peers, bundle patch and client platform declared')

// ---- 3. size bound ----
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path)
  return [path]
})
for (const path of walk(root)) {
  const size = statSync(path).size
  assert.ok(size <= SIZE_BOUND, path + ' is ' + size + ' bytes, over the ' + SIZE_BOUND + ' bound')
}
console.log('[ok] size bound: every file is at or under ' + SIZE_BOUND + ' bytes')
