/**
 * dsh-token-usage - host half.
 *
 * Deliberately inert. This package is a browser-only readout: every figure it
 * shows comes from session projections that @deepseek-ai/dsh-token-meter
 * already registers, so there is nothing to compute, cache, persist or expose
 * over RPC here.
 *
 * The plugin exists for exactly one reason: the client module system composes
 * its boot graph by scanning ENABLED Loader entries, so a package needs a
 * loadable host row before its \`dsh.client\` declaration becomes a browser
 * bundle. Keeping that row empty is the cheapest possible forward-compatibility
 * position - there is no host code that a future Harness release could break.
 *
 * @module dsh-token-usage
 */

/** Stable Cordis plugin name (matches the cordis.patch.yml row id). */
export const name = 'token-usage'

/** No host service is required. */
export const inject = []

/**
 * No-op body. Takes no configuration and registers nothing.
 */
export function apply() {}
