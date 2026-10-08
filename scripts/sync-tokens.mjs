#!/usr/bin/env node
/**
 * Regenerate scripts/tokens.snapshot.json from a live DSH installation.
 *
 * The snapshot is the allowlist scripts/check.mjs validates the stylesheet
 * against. It goes stale whenever upstream renames a theme variable, and a
 * stale entry is harmless by design: every var() in this plugin carries a
 * literal fallback, so a name that disappears degrades instead of breaking.
 * Re-run this when you want the gate sharp again.
 *
 * Usage:
 *   node scripts/sync-tokens.mjs [path/to/dsh-client-ui-theme/lib/client.js]
 *
 * With no argument it looks in the usual profile locations.
 *
 * @module dsh-token-usage/scripts/sync-tokens
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(root, 'scripts', 'tokens.snapshot.json')

/** Candidate locations, most specific first. */
function candidates() {
  const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
  return [
    process.argv[2],
    join(home, 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js'),
    join(home, 'profiles', 'desktop', 'node_modules', '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js'),
    join(home, 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-client-ui-theme', 'lib', 'client.js'),
  ].filter((value) => typeof value === 'string' && value.length > 0)
}

const source = candidates().find((path) => existsSync(path))
if (source === undefined) {
  console.error('sync-tokens: could not find dsh-client-ui-theme/lib/client.js.')
  console.error('Pass the path explicitly, e.g. from the Desktop app resources.')
  process.exit(1)
}

const text = readFileSync(source, 'utf8')
const names = [...new Set([...text.matchAll(/(--dsw-[a-z0-9-]+)\s*:/g)].map((match) => match[1]))].sort()
if (names.length === 0) {
  console.error('sync-tokens: no --dsw-* declarations found in ' + source)
  process.exit(1)
}

const snapshot = {
  $comment: 'Names of every --dsw-* custom property defined by @deepseek-ai/dsh-client-ui-theme. Regenerate with the sync-tokens script. The gate in scripts/check.mjs asserts the plugin only USES names listed here; a name that disappears upstream degrades to the literal fallback written next to it in the CSS, so a stale snapshot cannot break the plugin.',
  capturedFrom: source,
  count: names.length,
  names,
}
writeFileSync(OUTPUT, JSON.stringify(snapshot, null, 2) + '\n')
console.log('sync-tokens: wrote ' + names.length + ' names from ' + source)
