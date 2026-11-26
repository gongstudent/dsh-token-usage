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
import { tmpdir } from 'node:os'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
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
      if (deps[0] === 'sessionProjections') {
        callback(options.service === false ? {} : { sessionProjections: { register: (def) => registered.push(def) } })
      } else if (deps[0] === 'connection') {
        callback(options.connection === undefined ? {} : { connection: options.connection })
      } else {
        callback({})
      }
      return () => {}
    },
  }
  return { ctx, injections, registered }
}

{
  const { ctx, injections, registered } = makeCtx()
  host.apply(ctx)
  assert.equal(injections.length, 2, 'apply asks for both optional seams separately')
  assert.equal(Array.from(injections[0]).join(','), 'sessionProjections', 'first is the projection registry')
  assert.equal(Array.from(injections[1]).join(','), 'connection', 'then the optional Connection fetch seam')
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
  // The destructive route: remove exactly one stored session directory, detach
  // it from its Workspace and announce the removal to the client list.
  const routes = []
  const events = []
  const calls = { detach: [], unarchive: [], unpin: [], cacheDelete: [] }
  const ctx = {
    inject(deps, callback) {
      if (deps[0] === 'sessionProjections') callback({ sessionProjections: { register() {} } })
      else if (deps[0] === 'connection') callback({ connection: this.connection })
      else callback({})
    },
    connection: undefined,
    effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    get(name) {
      if (name === 'workspaceRegistry') return {
        list() { return [{ sessionIds: ['session-host-test'], async detachSession(id) { calls.detach.push(id) } }] },
        async unarchiveSession(id) { calls.unarchive.push(id) },
        async unpinSession(id) { calls.unpin.push(id) },
      }
      if (name === 'agents') return { get() { return undefined } }
      // The projection cache owns the derived rows; its table must be told the
      // session is gone, or the cache re-seeds a row the list already dropped.
      if (name === 'sessionProjectionCache') return {
        table: { async delete(id) { calls.cacheDelete.push(id) } },
      }
      return undefined
    },
    emit(name, id) { events.push([name, id]) },
    logger: { warn() {} },
  }
  const base = await mkdtemp(join(tmpdir(), 'dsh-token-usage-host-'))
  const sessionDir = join(base, 'sessions', '--proj--', 'session-host-test')
  const artifact = join(sessionDir, 'session.v4.jsonl.zstd')
  await mkdir(sessionDir, { recursive: true })
  await writeFile(artifact, 'test')
  ctx.connection = { fetch: { register(route) { routes.push(route); return async () => {} } } }
  ctx.get = ((original) => (name) => name === 'sessionPersistence'
    ? { async stat(id) { return id === 'session-host-test' ? { location: { kind: 'jsonl', path: artifact } } : undefined } }
    : original(name))(ctx.get)
  host.apply(ctx)
  assert.equal(routes.length, 1, 'the delete route registers when Connection is present')
  assert.equal(routes[0].path, '/api/token-usage/delete-session', 'the route path is stable for the client')
  assert.deepEqual(Array.from(routes[0].methods), ['POST'], 'the route accepts POST only')
  const response = await routes[0].fetch(new Request('http://local/api/token-usage/delete-session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'session-host-test' }),
  }))
  assert.equal(response.status, 200, 'the delete succeeds')
  assert.deepEqual(await response.json(), { ok: true, sessionId: 'session-host-test' })
  await assert.rejects(() => stat(artifact), 'the stored session artifact is gone')
  assert.deepEqual(calls.detach, ['session-host-test'], 'the session leaves its Workspace')
  assert.deepEqual(calls.unarchive, ['session-host-test'], 'the archive set is cleared')
  assert.deepEqual(calls.unpin, ['session-host-test'], 'the pin set is cleared')
  assert.deepEqual(calls.cacheDelete, ['session-host-test'], 'the derived projection-cache row is dropped with the log')
  assert.deepEqual(events, [['api-session/removed', 'session-host-test']], 'the client list is told to drop the row')
  await rm(base, { recursive: true, force: true })
  console.log('[ok] host: delete removes the session file, Workspace entry and list row')
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
