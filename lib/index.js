/**
 * dsh-token-usage - host half.
 *
 * This half exists for one reason: the calendar needs to know WHICH DAY tokens
 * were spent, and the only place that fact is recorded is the session event log.
 * Every committed assistant message carries the provider-reported usage for that
 * turn together with the wall-clock time it settled:
 *
 *   { type: 'assistant/message', time: 1791439585506,
 *     data: { usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } } }
 *
 * The client cannot see any of that. The token-usage projection the harness
 * already publishes folds the whole log into one cumulative total, so a session
 * list row offers a lifetime number and nothing about when it was spent.
 *
 * So this half registers ONE session projection that folds those same events
 * into per-day buckets. It is a pure fold: it reads nothing, writes nothing,
 * opens no port and makes no call. The client reads the result through the
 * ordinary projection pipeline, exactly as it reads the totals today.
 *
 * The dependency is optional on purpose. `ctx.inject` registers the projection
 * only when the service exists, so a future harness that moves or renames the
 * seam costs the per-day breakdown and nothing else - the plugin still loads and
 * the client falls back to its own approximation.
 *
 * It also owns one destructive route, registered only when the harness exposes
 * the authenticated Connection fetch seam: DELETE one conversation by removing
 * its stored session directory and detaching it from the Workspace registry.
 * Deleting the session artifact is also what removes its token history, because
 * every token figure this plugin shows is folded from that log.
 *
 * @module dsh-token-usage
 */

import { rm } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'

/** Stable Cordis plugin name (matches the cordis.patch.yml row id). */
export const name = 'token-usage'

/** No host service is required to load; the projection is registered if it can be. */
export const inject = []

/** The projection key the client reads. */
const KEY = 'tokenUsageByDay'

/** Authenticated route the client POSTs a session id to. */
const DELETE_ROUTE = '/api/token-usage/delete-session'

/** Bucket field names, in the order they are summed. */
const FIELDS = ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']

/** A finite, positive number, or zero. */
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Local YYYY-MM-DD for an instant, matching how the client buckets days. */
function dayKeyOf(at) {
  const date = new Date(at)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return String(date.getFullYear()) + '-' + (month < 10 ? '0' : '') + String(month) + '-' + (day < 10 ? '0' : '') + String(day)
}

/** One day's buckets from a provider usage record. */
function bucketsFrom(usage) {
  return {
    uncachedInputTokens: count(usage.inputTokens),
    outputTokens: count(usage.outputTokens),
    cacheReadTokens: count(usage.cacheReadTokens),
    cacheWriteTokens: count(usage.cacheWriteTokens),
  }
}

/**
 * Validate one bucket set.
 *
 * Written by hand rather than with a schema library: this is the whole shape, and
 * a projection state that fails validation is worse than no projection at all.
 */
function parseBuckets(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('tokenUsageByDay bucket must be an object')
  }
  const out = {}
  for (const field of FIELDS) out[field] = count(value[field])
  return out
}

/** Validate the whole state: a plain map of day key to bucket set. */
const stateSchema = {
  parse(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError('tokenUsageByDay state must be an object')
    }
    const out = {}
    for (const key of Object.keys(value)) out[key] = parseBuckets(value[key])
    return out
  },
}

/**
 * The per-day token usage unit.
 *
 * `apply` returns the SAME state reference for every event it does not care
 * about: the registry gates its change feed on `Object.is`, so allocating on
 * every event of every session would notify every client for nothing.
 */
const definition = {
  key: KEY,
  stateVersion: 1,
  stateSchema,
  init: () => ({}),
  apply: (state, event) => {
    if (event === null || typeof event !== 'object' || event.type !== 'assistant/message') return state
    const data = event.data
    const usage = data === null || typeof data !== 'object' ? undefined : data.usage
    if (usage === null || typeof usage !== 'object') return state
    const time = event.time
    if (typeof time !== 'number' || !Number.isFinite(time)) return state
    const key = dayKeyOf(time)
    const added = bucketsFrom(usage)
    const previous = state[key]
    const next = Object.assign({}, state)
    if (previous === undefined) {
      next[key] = added
      return next
    }
    const merged = {}
    for (const field of FIELDS) merged[field] = previous[field] + added[field]
    next[key] = merged
    return next
  },
  wire: { viewSchema: stateSchema, view: (state) => state },
}

/** Read one optional host service without making it a hard dependency. */
function service(ctx, name) {
  try {
    return typeof ctx.get === 'function' ? ctx.get(name) : undefined
  } catch {
    return undefined
  }
}

/**
 * Read one optional host service, treating both "absent" and "threw" as null.
 *
 * Same contract as {@link service}, but collapses the two miss shapes so callers
 * can test a single null instead of distinguishing undefined from an exception.
 */
async function serviceLive(ctx, name) {
  const found = service(ctx, name)
  return found === undefined ? null : found
}

/** The storage domain the projection cache owns (its `sessions` table holds the rows). */
const PROJECTION_CACHE_DOMAIN = 'session_projcache'

/** Warn through the host logger when it exists; never let diagnostics throw. */
function warn(ctx, message) {
  try {
    if (ctx !== null && typeof ctx === 'object' && ctx.logger !== null
      && typeof ctx.logger === 'object' && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn('[dsh-token-usage] ' + message)
    }
  } catch {
    // Diagnostics must never become the failure.
  }
}

/** JSON response helper. */
function json(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Encode one session id exactly as the JSONL persistence backend encodes it. */
function encodeSegment(raw) {
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
  }
  return out
}

/** The sessions root inferred from one stored artifact path, or undefined when the shape is unexpected. */
function sessionsRootOf(artifact) {
  const sessionDirectory = dirname(artifact)
  const projectDirectory = dirname(sessionDirectory)
  const root = dirname(projectDirectory)
  if (basename(root) !== 'sessions') return undefined
  return resolve(root)
}

/** Whether a child path stays strictly below a root. */
function isInside(root, child) {
  const resolved = resolve(child)
  return resolved !== root && resolved.startsWith(root + sep)
}

/** Detach a deleted session from every Workspace and from the archive/pin sets. */
async function detachSession(ctx, sessionId) {
  const registry = service(ctx, 'workspaceRegistry')
  if (registry === null || typeof registry !== 'object') return
  try {
    if (typeof registry.list === 'function') {
      for (const workspace of registry.list()) {
        try {
          if (workspace !== null && typeof workspace === 'object'
            && typeof workspace.detachSession === 'function'
            && Array.isArray(workspace.sessionIds)
            && workspace.sessionIds.includes(sessionId)) {
            await workspace.detachSession(sessionId)
          }
        } catch (error) {
          warn(ctx, 'workspace detach failed for ' + sessionId + ': ' + String(error))
        }
      }
    }
  } catch (error) {
    warn(ctx, 'workspace registry unavailable during delete: ' + String(error))
  }
  for (const method of ['unarchiveSession', 'unpinSession']) {
    try {
      if (typeof registry[method] === 'function') await registry[method](sessionId)
    } catch (error) {
      warn(ctx, method + ' failed for ' + sessionId + ': ' + String(error))
    }
  }
}

/**
 * Delete one stored Session directory.
 *
 * The route is destructive and deliberately strict: it accepts only an exact
 * stored artifact whose directory name matches the encoded session id inside a
 * directory named `sessions`, refuses a running Agent, and never follows a
 * path outside that store. A live but idle Agent is allowed once its file is no
 * longer locked; the client removes the row immediately after the host confirms.
 */
async function deleteSessionResponse(ctx, request) {
  let body
  try {
    body = await request.json()
  } catch {
    return json(400, { ok: false, error: '请求体不是合法 JSON' })
  }
  const rawId = body !== null && typeof body === 'object' ? body.sessionId : undefined
  const sessionId = typeof rawId === 'string' ? rawId.trim() : ''
  if (sessionId.length === 0 || sessionId.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) {
    return json(400, { ok: false, error: 'sessionId 无效' })
  }

  const persistence = service(ctx, 'sessionPersistence')
  if (persistence === null || typeof persistence !== 'object' || typeof persistence.stat !== 'function') {
    return json(500, { ok: false, error: '此版本无法定位会话文件（缺少 sessionPersistence）' })
  }
  let snapshot
  try {
    snapshot = await persistence.stat(sessionId)
  } catch (error) {
    warn(ctx, 'session stat failed for ' + sessionId + ': ' + String(error))
    return json(500, { ok: false, error: '读取会话存储失败' })
  }
  if (snapshot === undefined || snapshot === null) {
    return json(404, { ok: false, error: '未找到该会话的存储记录' })
  }
  const artifact = snapshot.location !== null && typeof snapshot.location === 'object'
    && typeof snapshot.location.path === 'string' ? snapshot.location.path : undefined
  if (artifact === undefined) {
    return json(500, { ok: false, error: '该会话没有可删除的持久化文件' })
  }

  const root = sessionsRootOf(artifact)
  const directory = dirname(artifact)
  if (root === undefined || !isInside(root, directory) || basename(directory) !== encodeSegment(sessionId)) {
    return json(400, { ok: false, error: '会话文件路径不在预期的会话仓库内' })
  }

  const agents = service(ctx, 'agents')
  const agent = agents !== null && typeof agents === 'object' && typeof agents.get === 'function'
    ? agents.get(sessionId) : undefined
  if (agent !== undefined && agent !== null && agent.status === 'running') {
    return json(409, { ok: false, error: '该对话正在运行，请等待当前回合结束后再删除' })
  }

  try {
    await rm(directory, { recursive: true, force: true })
  } catch (error) {
    warn(ctx, 'session rm failed for ' + sessionId + ': ' + String(error))
    return json(409, { ok: false, error: '会话文件正在被占用，请重启 DeepSeek Harness 后再删除' })
  }

  await detachSession(ctx, sessionId)
  // The stored log is gone; its derived rows must not outlive it, or the cache
  // re-seeds a session the list has already dropped.
  await dropProjectionCache(ctx, sessionId)
  try {
    if (typeof ctx.emit === 'function') ctx.emit('api-session/removed', sessionId)
  } catch (error) {
    warn(ctx, 'api-session/removed emit failed for ' + sessionId + ': ' + String(error))
  }
  return json(200, { ok: true, sessionId })
}

/**
 * Drop the projection-cache row for one deleted session.
 *
 * The cache service exposes no delete operation - only reads and writes - so the
 * row is removed through the same storage domain it owns. This matters because
 * the cache outlives the log: after the directory is gone the stale row keeps
 * re-seeding a session the client list has already dropped, and the row's own
 * identity check will not reject it (the bound log it names is the one we just
 * deleted). Failures are logged and never undo the deletion.
 */
async function dropProjectionCache(ctx, sessionId) {
  const cache = await serviceLive(ctx, 'sessionProjectionCache')
  if (cache === null || typeof cache !== 'object') return
  const table = cache.table
  if (table !== null && typeof table === 'object' && typeof table.delete === 'function') {
    try {
      await table.delete(sessionId)
      return
    } catch (error) {
      warn(ctx, 'projection cache delete failed for ' + sessionId + ': ' + String(error))
    }
  }
  // Fall back to the domain handle when the table getter is unavailable or the
  // delete above threw: opening the same domain is idempotent.
  try {
    const domain = service(ctx, 'storageDomain')
    if (domain === null || typeof domain.open !== 'function') return
    const opened = await domain.open(PROJECTION_CACHE_DOMAIN)
    if (opened !== null && typeof opened === 'object' && typeof opened.table === 'function') {
      const openedTable = opened.table('sessions')
      if (openedTable !== null && typeof openedTable === 'object' && typeof openedTable.delete === 'function') {
        await openedTable.delete(sessionId)
      }
    }
  } catch (error) {
    warn(ctx, 'projection cache row left behind for ' + sessionId + ': ' + String(error))
  }
}

/** Register the authenticated delete route when the host exposes the Connection fetch seam. */
function registerDeleteRoute(ctx) {
  if (typeof ctx.inject !== 'function') return
  try {
    // Declaring the optional service makes Cordis wait until Connection exists;
    // reading ctx.get() at apply time would race the host's own boot order and
    // silently lose the route on every fresh start.
    ctx.inject(['connection'], function (scoped) {
      const connection = scoped !== null && typeof scoped === 'object' && scoped.connection !== undefined
        ? scoped.connection
        : service(ctx, 'connection')
      if (connection === null || typeof connection !== 'object') return
      const fetchApi = connection.fetch
      if (fetchApi === null || typeof fetchApi !== 'object' || typeof fetchApi.register !== 'function') return
      try {
        const dispose = fetchApi.register({
          path: DELETE_ROUTE,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: (request) => deleteSessionResponse(ctx, request),
        })
        if (typeof scoped.effect === 'function') scoped.effect(() => dispose, 'token-usage: delete-session route')
        else if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'token-usage: delete-session route')
      } catch (error) {
        warn(ctx, 'delete-session route not registered: ' + String(error))
      }
    })
  } catch (error) {
    warn(ctx, 'delete-session route not registered: ' + String(error))
  }
}

/**
 * Register the per-day projection when the harness offers the seam.
 *
 * `ctx.inject` re-runs if the service is ever replaced, and the registration
 * is disposed with it, so this needs no lifecycle handling of its own.
 */
export function apply(ctx) {
  if (ctx === null || typeof ctx !== 'object' || typeof ctx.inject !== 'function') return
  try {
    ctx.inject(['sessionProjections'], function (scoped) {
      const registry = scoped === null || scoped === undefined ? undefined : scoped.sessionProjections
      if (registry === null || registry === undefined || typeof registry.register !== 'function') return
      registry.register(definition)
    })
  } catch (error) {
    // A harness without the seam costs the per-day breakdown, never the plugin.
    warn(ctx, 'per-day projection not registered: ' + String(error))
  }
  // The destructive route is a separate optional face: a host without the
  // Connection fetch seam keeps the read-only plugin and loses only deletion.
  registerDeleteRoute(ctx)
}
