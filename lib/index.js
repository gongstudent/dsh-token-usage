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
 * @module dsh-token-usage
 */

/** Stable Cordis plugin name (matches the cordis.patch.yml row id). */
export const name = 'token-usage'

/** No host service is required to load; the projection is registered if it can be. */
export const inject = []

/** The projection key the client reads. */
const KEY = 'tokenUsageByDay'

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
    if (typeof ctx.logger === 'object' && ctx.logger !== null && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn('[dsh-token-usage] per-day projection not registered: ' + String(error))
    }
  }
}
