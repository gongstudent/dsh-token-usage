#!/usr/bin/env node
/**
 * Behavioural checks for the host half.
 *
 * The host half registers one session projection. Its contract is small enough
 * to exercise directly: a fake registry captures the definition, synthetic
 * events are folded through it, and the resulting per-day buckets are compared.
 *
 * Nothing here needs a running harness.
 */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const host = await import(pathToFileURL(join(here, '..', 'lib', 'index.js')).href)

console.log('[ok] host: module loads and exports a Cordis plugin')
assert.equal(host.name, 'token-usage', 'the plugin name matches the patch row id')
assert.ok(Array.isArray(host.inject), 'inject is declared')
// A hard dependency would leave the plugin unapplied - and with it the whole
// readout - on a harness that moved the seam.
assert.deepEqual(host.inject, [], 'the seam is not a hard dependency')
assert.equal(typeof host.apply, 'function', 'apply is exported')

/** A fake host context that records how the projection is registered. */
function makeCtx(options = {}) {
  const injections = []
  const registered = []
  const ctx = {
    inject(deps, callback) {
      injections.push(deps)
      if (options.neverFires === true) return () => {}
      callback(options.service === false ? {} : { sessionProjections: { register: (def) => registered.push(def) } })
      return () => {}
    },
  }
  return { ctx, injections, registered }
}

{
  const { ctx, injections, registered } = makeCtx()
  host.apply(ctx)
  assert.equal(injections.length, 1, 'apply asks for exactly one service')
  assert.equal(Array.from(injections[0]).join(','), 'sessionProjections', 'and it is the projection registry')
  assert.equal(registered.length, 1, 'one projection is registered')

  const def = registered[0]
  assert.equal(def.key, 'tokenUsageByDay', 'the key the client reads')
  assert.ok(Number.isSafeInteger(def.stateVersion) && def.stateVersion >= 0, 'stateVersion is a non-negative integer')
  // The registry calls parse() on both, so both must exist and must reject junk.
  assert.equal(typeof def.stateSchema.parse, 'function', 'the state schema is parseable')
  assert.equal(typeof def.wire.viewSchema.parse, 'function', 'the view schema is parseable')
  assert.deepEqual(def.init(), {}, 'the initial state is empty')
  assert.equal(typeof def.apply, 'function', 'the unit folds events')
  assert.equal(typeof def.wire.view, 'function', 'the wire view is a function')
  console.log('[ok] host: registers tokenUsageByDay with both schemas the registry parses')
}

{
  const { ctx, registered } = makeCtx()
  host.apply(ctx)
  const def = registered[0]

  // Two settled assistant messages on two different local days.
  const day1 = new Date(2026, 9, 8, 14, 6, 25).getTime()
  const day2 = new Date(2026, 9, 9, 10, 30, 0).getTime()
  const message = (time, usage) => ({ type: 'assistant/message', time, data: { usage } })

  let state = def.init()
  state = def.apply(state, message(day1, { inputTokens: 3416, outputTokens: 150, cacheReadTokens: 8332 }))
  state = def.apply(state, message(day1, { inputTokens: 552, outputTokens: 488, cacheReadTokens: 11618 }))
  state = def.apply(state, message(day2, { inputTokens: 900, outputTokens: 100, cacheReadTokens: 4000, cacheWriteTokens: 7 }))

  assert.deepEqual(Object.keys(state).sort(), ['2026-10-08', '2026-10-09'], 'one bucket per local day')
  assert.deepEqual(state['2026-10-08'], {
    uncachedInputTokens: 3968, outputTokens: 638, cacheReadTokens: 19950, cacheWriteTokens: 0,
  }, 'day one sums both turns')
  assert.deepEqual(state['2026-10-09'], {
    uncachedInputTokens: 900, outputTokens: 100, cacheReadTokens: 4000, cacheWriteTokens: 7,
  }, 'day two holds only its own turn')

  // The change feed is gated on Object.is, so an irrelevant event must not
  // allocate - every event of every session passes through here.
  const same = def.apply(state, { type: 'tool/result', time: day2, data: {} })
  assert.equal(same, state, 'an irrelevant event returns the same reference')
  const noUsage = def.apply(state, { type: 'assistant/message', time: day2, data: {} })
  assert.equal(noUsage, state, 'a message with no usage returns the same reference')
  const noTime = def.apply(state, { type: 'assistant/message', data: { usage: { inputTokens: 5 } } })
  assert.equal(noTime, state, 'a message with no time returns the same reference')

  // The view must round-trip through its own schema.
  assert.deepEqual(def.wire.viewSchema.parse(def.wire.view(state)), state, 'the view survives its schema')
  console.log('[ok] host: folds settled messages into one bucket set per local day')
}

{
  const { ctx, registered } = makeCtx()
  host.apply(ctx)
  const def = registered[0]
  assert.throws(() => def.stateSchema.parse(null), 'null state is rejected')
  assert.throws(() => def.stateSchema.parse([]), 'an array is not a state')
  assert.throws(() => def.stateSchema.parse({ '2026-10-09': 5 }), 'a non-object bucket is rejected')
  // Unknown or negative counts are coerced to zero rather than propagated.
  assert.deepEqual(def.stateSchema.parse({ '2026-10-09': { uncachedInputTokens: -5, outputTokens: 'x' } }), {
    '2026-10-09': { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  }, 'junk counts become zero')
  console.log('[ok] host: the state schema rejects junk instead of publishing it')
}

{
  // Every degradation path: no ctx, no inject, a service that never arrives, and
  // a service object without register().
  host.apply(undefined)
  host.apply(null)
  host.apply({})
  const never = makeCtx({ neverFires: true })
  host.apply(never.ctx)
  assert.equal(never.registered.length, 0, 'a service that never arrives registers nothing')
  const absent = makeCtx({ service: false })
  host.apply(absent.ctx)
  assert.equal(absent.registered.length, 0, 'a service without register() registers nothing')
  console.log('[ok] host: every missing seam costs the projection, never a throw')
}

console.log('')
console.log('all host checks passed')
