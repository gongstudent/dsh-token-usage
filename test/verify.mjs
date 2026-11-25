#!/usr/bin/env node
/**
 * Behavioural checks for dsh-token-usage.
 *
 * The bundle is executed in a fake DOM with a fake React and a fake client
 * context. Nothing here needs a running harness, which is the point: every
 * forward-compatibility rule in docs/requirements.md is expressed as an
 * assertion that a MISSING or BROKEN host facility still costs nothing.
 *
 * @module dsh-token-usage/test/verify
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(process.env.TU_BUNDLE ?? join(root, 'lib', 'client.js'), 'utf8')

/** Minimal React: enough to invoke a function component outside a renderer. */
function makeReact() {
  const slots = []
  let cursor = 0
  const React = {
    createElement(type, props, ...children) {
      const merged = Object.assign({}, props)
      if (children.length === 1) merged.children = children[0]
      else if (children.length > 1) merged.children = children
      return { type, props: merged }
    },
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect() { cursor++ },
    useCallback(fn) { cursor++; return fn },
    useMemo(fn) { cursor++; return fn() },
    useSyncExternalStore(subscribe, getSnapshot) {
      cursor++
      const stop = subscribe(() => {})
      stop()
      return getSnapshot()
    },
    Component: class Component { constructor(props) { this.props = props || {} } },
  }
  // Reset between invocations; a seed pre-places hook state so a test can
  // start a component in a state the first render would not reach.
  React.__reset = (seed) => {
    cursor = 0
    slots.length = 0
    if (seed !== undefined) for (const key of Object.keys(seed)) slots[Number(key)] = seed[key]
  }
  return React
}

/** A fake workspace service holding a fixed archived set. */
function fakeWorkspaces(archived) {
  const ids = archived === undefined ? [] : archived
  return { list: { subscribe: () => () => {}, getSnapshot: () => ({ archivedSessionIds: ids }) } }
}

/** A fake localStorage, so the ledger round-trip is testable. */
function makeStorage(seed) {
  const data = new Map(seed === undefined ? [] : Object.entries(seed))
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)) },
    removeItem: (key) => { data.delete(key) },
  }
}

/** Load the bundle against a fake DOM; returns its exports plus the DOM it touched. */
function loadBundle(storage, options = {}) {
  const react = makeReact()
  const injected = []
  const document = {
    head: { appendChild: (node) => injected.push(node) },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  let definition
  const errors = []
  const store = storage === undefined ? makeStorage() : storage
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: (value) => { definition = value } }, confirm: options.confirm },
    document,
    navigator: { language: 'en' },
    localStorage: store,
    fetch: options.fetch,
    console: { error: (...args) => errors.push(args), warn: () => {}, log: () => {} },
  })
  assert.ok(definition, 'bundle registers a module')
  const exported = definition.factory((specifier) => {
    assert.equal(specifier, 'react', 'the bundle imports only the platform seed table')
    return react
  })
  return { exported, react, injected, errors, store }
}

/** A fake client context; each facility can be withheld or sabotaged. */
function makeCtx(options = {}) {
  const registered = []
  const effects = []
  const localeCalls = []
  const injectCalls = []
  const menuCalls = []
  const contextMenus = {
    register(definition) { menuCalls.push(definition); return () => {} },
  }
  const ctx = {
    get(name) {
      if (options.getThrows === true) throw new Error('service registry unavailable')
      if (name === 'slots') {
        if (options.slots === false) return undefined
        return {
          inject(key, callback) { callback(); return () => {} },
          register(opts, component) {
            if (options.registerThrows === true) throw new Error('slot not declared')
            registered.push({ options: opts, component })
            return () => {}
          },
        }
      }
      if (name === 'locale') {
        if (options.locale === false) return undefined
        return {
          register: (ns, dictionaries) => { localeCalls.push({ ns, dictionaries }); return () => {} },
          bind: () => (key, vars) => {
            let text = key
            if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
            return text
          },
          getSnapshot: () => ({ active: options.hostLocale ?? 'en' }),
        }
      }
      if (name === 'contextMenus') {
        if (options.contextMenus === false) return undefined
        return contextMenus
      }
      if (name === 'sessions') {
        if (options.sessions === false) return undefined
        return options.sessions ?? fakeSessions([])
      }
      return undefined
    },
  }
  if (options.effect !== false) ctx.effect = (fn, label) => { const dispose = fn(); effects.push({ label, dispose }); return dispose }
  // Cordis holds a plugin until its declared services exist, then runs the
  // callback. `injectNever` models a service that never arrives.
  ctx.inject = (deps, callback) => {
    injectCalls.push(deps)
    if (options.injectNever === true) return () => {}
    const child = {
      sessions: options.sessions === false ? undefined : (options.sessions ?? fakeSessions([])),
      contextMenus: options.contextMenus === false ? undefined : contextMenus,
    }
    callback(child)
    return () => {}
  }
  return { ctx, registered, effects, localeCalls, injectCalls, menuCalls }
}

const DAY = 86400000
const keyOfLocal = (ms) => {
  const d = new Date(ms)
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}
const dayStartLocal = (ms) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
const mondayLocal = (ms) => {
  const start = dayStartLocal(ms)
  return start - ((new Date(start).getDay() + 6) % 7) * DAY
}
const usage = (input, cache, output, write) => ({
  uncachedInputTokens: input,
  outputTokens: output,
  cacheReadTokens: cache,
  cacheWriteTokens: write ?? 0,
})

/**
 * A fake client session list shaped like the real one: token usage, the
 * model-selection projection and the list-metadata timestamp all live under
 * projectionValues.
 */
function fakeSessions(rows) {
  const byId = {}
  for (const row of rows) {
    const values = {}
    if (row.usage !== undefined) values.tokenUsage = row.usage
    if (row.model !== undefined) values.modelSelection = { lastUsed: { provider: 'deepseek', model: row.model } }
    if (row.at !== undefined) values.sessionListMetadata = { blank: false, lastPromptAt: row.at }
    // The host's exact per-day fold, when a test provides one.
    if (row.byDay !== undefined) values.tokenUsageByDay = row.byDay
    byId[row.id] = {
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      // Read and activity stamps really are present on the list rows; the day
      // attribution deliberately ignores them.
      updatedAt: row.updatedAt,
      lastActivityAt: row.lastActivityAt,
      header: row.headerCreatedAt === undefined ? undefined : { createdAt: row.headerCreatedAt },
      projectionValues: values,
    }
  }
  return { list: { subscribe: () => () => {}, getSnapshot: () => ({ byId }) } }
}

const { exported, react, injected, errors, store } = loadBundle()

// ---------------------------------------------------------------- envelope
assert.equal(typeof exported.apply, 'function', 'exports.apply is a function')
assert.ok(Array.isArray(exported.inject), 'exports.inject is an array')
// The client Loader runs apply() the moment the plugin has no unmet dependency.
// Without this the plugin applied before the renderer provided `slots`, the
// guard in apply() saw no service and returned, and nothing was registered.
assert.ok(exported.inject.includes('slots'), 'the plugin must wait for the slots service before applying')
assert.equal(injected.length, 0, 'loading the bundle alone injects nothing')
console.log('[ok] envelope: apply/inject exported; module load has no side effects')

// ------------------------------------------------------- happy-path apply
{
  const { ctx, registered, effects, localeCalls, injectCalls } = makeCtx()
  exported.apply(ctx)
  assert.equal(injected.length, 1, 'exactly one stylesheet is injected by apply()')
  assert.equal(injected[0].dataset.plugin, 'dsh-token-usage', 'stylesheet carries the owning plugin id')
  assert.equal(injected[0].dataset.pluginCss, 'dsh-token-usage/client.css', 'stylesheet carries its stable id')
  assert.equal(registered.length, 4, 'four seats: composer, sidebar card, main panel, panel icon')

  const dock = registered.find((entry) => entry.options.name === 'conversation.composer.dock')
  const sidebar = registered.find((entry) => entry.options.name === 'sidebar.footer.action')
  assert.ok(dock, 'registers the composer seat')
  assert.ok(sidebar, 'registers the sidebar seat')
  assert.equal(dock.options.id, 'token-usage', 'list slots require an id')
  assert.equal(sidebar.options.id, 'token-usage', 'list slots require an id')
  assert.equal(dock.options.locale, 'token-usage', 'declares its namespace when a locale face exists')
  assert.equal(sidebar.options.locale, 'token-usage', 'declares its namespace when a locale face exists')
  // The Settings section was removed on request: the report lives once, in the
  // main-column panel. A second entry meant two places to drift apart.
  assert.equal(registered.filter((entry) => entry.options.name === 'settings.section').length, 0,
    'no settings section is registered any more')

  // The full main-column panel and the sidebar icon that opens it. Both carry
  // the SAME panel key: the sidebar routes an entry id to the main cell whose
  // key matches, so these two registrations are one feature.
  const main = registered.find((entry) => entry.options.name === 'main')
  const panelIcon = registered.find((entry) => entry.options.name === 'sidebar.panellist')
  assert.ok(main, 'registers the full main-column panel')
  assert.ok(panelIcon, 'registers the sidebar panel-list icon')
  assert.equal(main.options.key, 'token-usage', 'the main cell is keyed by the entry id')
  assert.equal(panelIcon.options.id, 'token-usage', 'the icon carries that same id')
  assert.equal(typeof panelIcon.options.label, 'function', 'the icon label is a thunk so it follows the locale')
  assert.ok(JSON.stringify(panelIcon.options.label()).includes('Token usage'), 'the icon label reads the active locale')
  assert.ok(Number.isFinite(panelIcon.options.order), 'the icon declares its position in the list')

  assert.equal(localeCalls.length, 1, 'registers its dictionaries once')
  assert.deepEqual(Object.keys(localeCalls[0].dictionaries).sort(), ['en', 'zh'], 'both locales registered')
  assert.ok(effects.some((entry) => String(entry.label).includes('stylesheet')), 'owns a stylesheet disposer')
  assert.ok(effects.some((entry) => String(entry.label).includes('dictionaries')), 'owns a dictionary disposer')
  assert.equal(errors.length, 0, 'the happy path logs nothing to the console')
  assert.equal(injectCalls.length, 2, 'both optional dependencies are declared')
  assert.equal(Array.from(injectCalls[0]).join(','), 'sessions', 'the cross-session seats wait for the session list')
  assert.equal(Array.from(injectCalls[1]).join(','), 'contextMenus', 'the row menu waits for the context-menu service')
  console.log('[ok] apply: registers every seat, the main panel and its icon, and both disposers, silently')
}
{
  // The sidebar's Session row menu is the primary entry point: right-clicking
  // a conversation in the workspace list must offer Delete.
  const { ctx, menuCalls } = makeCtx()
  exported.apply(ctx)
  assert.equal(menuCalls.length, 1, 'one Session context-menu contribution is registered')
  const menu = menuCalls[0]
  assert.equal(menu.target, 'session', 'the contribution targets sidebar Session rows')
  assert.equal(menu.order, 700, 'it sorts after the built-in actions')
  const actions = menu.resolve({ sessionId: 'session-alpha', displayTitle: 'Alpha session' })
  assert.equal(actions.length, 1, 'the menu offers one action')
  assert.equal(actions[0].id, 'delete', 'the action is Delete')
  assert.equal(actions[0].danger, true, 'the action is marked destructive')
  assert.equal(actions[0].icon.key, 'workspace.delete', 'the action reuses the official trash icon')
  assert.ok(String(actions[0].label).length > 0, 'the action carries a localized label')
  assert.equal(typeof actions[0].run, 'function', 'the action is wired')
  assert.equal(actions[0].separatorBefore, true, 'the destructive action is separated from the built-ins')

  const calls = []
  const loaded = loadBundle(makeStorage(), {
    fetch: (url, init) => {
      calls.push({ url, init })
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' })
    },
  })
  const runCtx = makeCtx()
  loaded.exported.apply(runCtx.ctx)
  const runAction = runCtx.menuCalls[0].resolve({ sessionId: 'session-alpha', displayTitle: 'Alpha session' })[0]
  runAction.run()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1, 'the menu action sends one delete request')
  assert.ok(calls[0].url.includes('api/token-usage/delete-session'), 'the menu action targets the host route')
  assert.equal(JSON.parse(calls[0].init.body).sessionId, 'session-alpha', 'the menu action names the right session')
  console.log('[ok] apply: sidebar Session menu offers Delete')
}

// ------------------------------------------------------ host locale label
{
  const { ctx, registered } = makeCtx({ hostLocale: 'zh-CN' })
  exported.apply(ctx)
  // The sidebar panel icon carries the only remaining label, so it is what
  // has to follow the host locale now.
  const icon = registered.find((entry) => entry.options.name === 'sidebar.panellist')
  assert.ok(JSON.stringify(icon.options.label()).includes('Token 用量'), 'the panel icon label follows a Chinese host locale')
  console.log('[ok] apply: the panel icon label tracks the host locale')
}

// -------------------------------------------------- degraded environments
{
  const { ctx, registered } = makeCtx({ locale: false })
  exported.apply(ctx)
  assert.equal(registered.length, 4, 'still registers every seat without a locale face')
  for (const entry of registered) {
    assert.equal(entry.options.locale, undefined,
      'must NOT declare a namespace without a locale face (assembly would throw)')
  }
  console.log('[ok] apply: no locale face -> registers without a namespace, no throw')
}
{
  const { ctx, registered } = makeCtx({ slots: false })
  exported.apply(ctx)
  assert.equal(registered.length, 0, 'registers nothing without a slots service')
  console.log('[ok] apply: no slots service -> silent no-op')
}
{
  // A session list that never arrives must cost only the two cross-session
  // seats: the composer reading does not depend on it and must still register.
  const { ctx, registered, injectCalls } = makeCtx({ injectNever: true })
  exported.apply(ctx)
  assert.equal(injectCalls.length, 2, 'the dependencies were declared')
  assert.equal(Array.from(injectCalls[0]).join(','), 'sessions', 'and it is the session list')
  assert.equal(Array.from(injectCalls[1]).join(','), 'contextMenus', 'and the context menu')
  assert.equal(registered.length, 1, 'only the composer seat registers without a session list')
  // The main panel and its icon need the session list too, so they wait with
  // the settings page rather than half-registering a panel with no data.
  assert.equal(registered[0].options.name, 'conversation.composer.dock', 'and it is the composer seat')
  console.log('[ok] apply: a session list that never arrives costs only the two cross-session seats')
}
{
  const { ctx } = makeCtx({ effect: false })
  exported.apply(ctx)
  console.log('[ok] apply: no ctx.effect -> silent no-op')
}
{
  const { ctx } = makeCtx({ registerThrows: true })
  exported.apply(ctx)
  console.log('[ok] apply: slots.register throwing -> contained')
}
{
  const { ctx } = makeCtx({ getThrows: true })
  exported.apply(ctx)
  console.log('[ok] apply: a throwing service registry -> contained')
}
exported.apply(undefined)
exported.apply(null)
exported.apply({})
console.log('[ok] apply: absent or empty context -> contained')

// registerThrows sabotages all four seats (composer, sidebar card, main panel,
// panel icon) and getThrows sabotages the locale lookup plus the service lookup
// (2), so six diagnostics and no throw.
assert.equal(errors.length, 6, 'every sabotaged step reports exactly once')
assert.ok(errors.every((entry) => String(entry[0]).startsWith('[dsh-token-usage] ')), 'diagnostics are namespaced')
console.log('[ok] diagnostics: sabotage is reported once each, never thrown')

// -------------------------------------------------------- component shape
const { ctx: happyCtx, registered: happyRegistered } = makeCtx()
exported.apply(happyCtx)
const Dock = happyRegistered.find((entry) => entry.options.name === 'conversation.composer.dock').component
/**
 * The report component. The Settings section seat was removed, so the only seat
 * that renders the report is the main-column panel. Extracting the component
 * UsagePage embeds keeps every existing test meaningful: they all drive the
 * report, not the seat that happens to host it.
 */
const Page = happyRegistered.find((entry) => entry.options.name === 'main').component
const Section = (function extractReport() {
  react.__reset()
  const outer = Page({})
  let boundary = null
  const walk = (node) => {
    if (boundary !== null || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (node.type && node.type.name === 'MeterBoundary') { boundary = node; return }
    if (node.props) walk(node.props.children)
  }
  walk(outer.props.children)
  assert.ok(boundary, 'the page embeds the report behind a boundary')
  const inner = boundary.props.children
  assert.equal(typeof inner.type, 'function', 'the embedded report is a component')
  // Re-wrap it exactly the way the (removed) settings seat did, so every
  // existing test keeps driving the same two-layer shape.
  const Boundary = boundary.type
  const Report = inner.type
  return function SectionWrapper(props) {
    return react.createElement(Boundary, null, react.createElement(Report, props))
  }
})()

/**
 * Baseline sessions at zero, so the spend that follows counts as observed
 * growth. Per-day attribution only has evidence for spend the plugin watched,
 * so a test that wants a populated calendar has to let it watch.
 */
function warm(ids) {
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const warmed = render(Side, {
    sessions: fakeSessions(ids.map((id) => ({ id, title: id, usage: usage(0, 0, 0, 0) }))),
    wide: true,
  })
}

/** The registered entry's outer element - the error boundary itself. */
function outerOf(Component, props) {
  react.__reset()
  return Component(props)
}

/** Invoke the registered entry and return the element it wraps. */
function entryOf(Component, props) {
  react.__reset()
  const outer = Component(props)
  assert.ok(outer, 'the entry renders an element')
  assert.equal(outer.type.name, 'MeterBoundary', 'the view sits behind an error boundary')
  return outer.props.children
}

/** Invoke the inner component; pass a hook seed to start it in a given state. */
function render(Component, props, seed) {
  const inner = entryOf(Component, props)
  react.__reset(seed)
  return inner.type(inner.props)
}

/** Depth-first search for the first element carrying one class name. */
function findByClass(node, className) {
  if (node === null || typeof node !== 'object') return undefined
  if (typeof node.props === 'object' && node.props !== null) {
    const value = node.props.className
    if (typeof value === 'string' && value.split(/\s+/).includes(className)) return node
  }
  const children = node.props === undefined ? undefined : node.props.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findByClass(child, className)
      if (found !== undefined) return found
    }
  } else if (children !== undefined) {
    return findByClass(children, className)
  }
  return undefined
}

/** Depth-first search for EVERY element whose className contains a fragment. */
function findAll(node, fragment, found = []) {
  if (node === null || node === undefined) return found
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, fragment, found)
    return found
  }
  if (typeof node !== 'object') return found
  if (node.props && typeof node.props.className === 'string' && node.props.className.includes(fragment)) found.push(node)
  if (node.props) findAll(node.props.children, fragment, found)
  return found
}

/**
 * The heatmap grid's day cells.
 *
 * The grid sits inside a horizontal scroller now, so reach it by class rather
 * than by fixed child index - the legend draws sample cells too, which is why
 * the grid is looked up explicitly.
 */
function heatCellsOf(heatmap) {
  const grid = findAll(heatmap, 'tu-heat-grid')[0]
  assert.ok(grid, 'the heatmap grid is present')
  return grid.props.children
}

/** Hook index 0 of the composer reading is its open flag. */
const OPEN = { 0: true }

const dockProps = {
  useProjection: (key) => ({
    tokenUsage: usage(3120, 41880, 1530, 2048),
    contextPressure: { projectedTokens: 45200, contextWindow: 200000 },
    contextBreakdown: { systemTokens: 6100, toolsTokens: 9400, messageTokens: 29700 },
    modelSelection: { lastUsed: { provider: 'deepseek', model: 'deepseek-flash' } },
  }[key]),
}

{
  const tree = render(Dock, dockProps)
  assert.ok(tree, 'renders collapsed')
  const text = JSON.stringify(tree)
  assert.ok(text.includes('In 3.1k'), 'collapsed reading shows the uncached input bucket')
  assert.ok(text.includes('Cache 41.9k'), 'collapsed reading shows the cache-read bucket')
  assert.ok(text.includes('Out 1.5k'), 'collapsed reading shows the output bucket')
  assert.ok(!text.includes('Hit '), 'the collapsed reading carries no hit rate')
  assert.ok(!text.includes('\u00a5'), 'the collapsed reading carries no money')
  assert.ok(!text.includes('tu-panel'), 'the panel is absent while collapsed')
  const trigger = tree.props.children
  assert.equal(trigger.props['aria-expanded'], false, 'the trigger advertises its collapsed state')
  assert.equal(trigger.props['aria-haspopup'], 'dialog', 'the trigger announces a dialog')
  assert.equal(trigger.props.type, 'button', 'the trigger is a real button, reachable by keyboard')
  assert.ok(String(trigger.props['aria-label']).length > 0, 'the trigger carries an accessible name')
  console.log('[ok] dock: collapsed reading shows the three buckets, no hit rate, no money')
}
{
  const tree = render(Dock, dockProps, OPEN)
  assert.ok(tree, 'renders expanded')
  const text = JSON.stringify(tree)
  assert.ok(text.includes('tu-panel'), 'the panel is present while expanded')
  assert.ok(text.includes('22.6%'), 'shows context occupancy')
  assert.ok(text.includes('tu-bar-fill'), 'draws the occupancy bar')
  assert.ok(text.includes('45.2k'), 'shows the anchored prompt size')
  assert.ok(text.includes('tu-btn'), 'offers the refresh control')
  assert.ok(text.includes('deepseek-flash'), 'names the model')
  assert.ok(text.includes('89.0%'), 'the panel reports the hit rate')
  assert.ok(!text.includes('\u00a5'), 'the panel carries no money')
  console.log('[ok] dock: expanded panel shows model, occupancy, hit rate and refresh')
}
{
  // A model the reader cannot name must still render, as an em dash.
  const unknown = { useProjection: (key) => (key === 'modelSelection' ? { lastUsed: { model: '' } } : dockProps.useProjection(key)) }
  const text = JSON.stringify(render(Dock, unknown, OPEN))
  assert.ok(text.includes('\u2014'), 'an unnamed model renders as an em dash')
  console.log('[ok] dock: an unnamed model degrades to an em dash')
}
{
  const tree = render(Dock, { useProjection: () => undefined })
  assert.equal(tree, null, 'no tokenUsage projection -> renders nothing')
  console.log('[ok] dock: missing tokenUsage projection -> null, no throw')
}
{
  const tree = render(Dock, {})
  assert.equal(tree, null, 'no useProjection hook at all -> renders nothing')
  console.log('[ok] dock: no useProjection prop -> null, no throw')
}
{
  const tree = render(Dock, { useProjection: (key) => (key === 'tokenUsage' ? usage(10, 0, 5) : undefined) }, OPEN)
  assert.ok(tree, 'renders with only the bucket projection')
  assert.ok(!JSON.stringify(tree).includes('tu-bar-fill'), 'occupancy block omitted when the projection is absent')
  console.log('[ok] dock: partial projections degrade section by section')
}
{
  const tree = render(Dock, { useProjection: (key) => (key === 'tokenUsage' ? usage(0, 0, 0, 0) : undefined) }, OPEN)
  assert.ok(tree, 'renders an all-zero projection')
  assert.ok(!JSON.stringify(tree).includes('NaN'), 'no NaN reaches the tree')
  console.log('[ok] dock: all-zero usage -> em dash, no NaN')
}

// -------------------------------------------------------- settings page
{
  const now = Date.now()
  warm(['session-alpha', 'session-beta'])
  const sessions = fakeSessions([
    { id: 'session-alpha', title: 'Alpha session', at: now, model: 'deepseek-flash', usage: usage(2000, 4000, 800) },
    { id: 'session-beta', title: 'Beta session', at: now - 3 * DAY, model: 'cline-pass/deepseek-v4-pro', usage: usage(1000, 9000, 500, 100) },
  ])
  const tree = render(Section, { sessions })
  assert.ok(tree, 'the settings page renders')
  const text = JSON.stringify(tree)
  // No "this session" card: this page is root-scoped and the host exposes no
  // active-session id there, so the card could only guess the newest session.
  assert.ok(!text.includes('This session'), 'no misleading this-session card')
  assert.ok(text.includes('Today'), 'renders the today card')
  assert.ok(text.includes('All time'), 'renders the all-time card')
  assert.ok(text.includes('tu-cards'), 'lays the cards out in a grid')
  assert.ok(text.includes('tu-heat-grid'), 'renders the usage heatmap')
  assert.ok(text.includes('tu-heat-months'), 'renders the month axis')
  assert.ok(text.includes('tu-legend'), 'renders the heatmap legend')
  assert.ok(text.includes('deepseek-flash'), 'names the model in the grouped table')
  assert.ok(text.includes('tu-range'), 'renders the date-range filter')
  assert.ok(text.includes('type\':\'date') || text.includes('"date"'), 'renders start and end date inputs')
  assert.ok(text.includes('Last 7 days'), 'renders the quick presets')
  assert.ok(!text.includes('\u00a5'), 'the report carries no money')
  // The window is one full year of FIXED-SIZE cells: a young history leaves
  // its oldest weeks empty instead of shrinking the frame into a few giant
  // squares. The grid scrolls horizontally rather than stretching.
  assert.ok(!text.includes('tu-slider'), 'no continuous window slider is rendered')
  assert.ok(text.includes('tu-heat-scroll'), 'the grid lives in a horizontal scroller')
  const heatBlock = tree.props.children[3]
  const heatmap = heatBlock.props.children[2]
  // Only the grid's own cells count: the legend draws sample cells too.
  const grid = findAll(heatmap, 'tu-heat-grid')[0]
  assert.ok(grid, 'the grid is present')
  const cells = grid.props.children
  // Columns = the real span since first use, capped at one year. A short
  // history draws only its own weeks, starting at the first recorded week.
  assert.ok(cells.length > 0 && cells.length <= 53 * 7, 'columns cover the real span, capped at a year')
  assert.equal(cells.length % 7, 0, 'the grid holds whole weeks')
  const winBar = heatBlock.props.children[3]
  assert.ok(JSON.stringify(winBar).includes('tu-windowbar'), 'the window is captioned instead of draggable')
  assert.ok(!JSON.stringify(winBar).includes('tu-windownav'), 'short history offers no paging controls')
  const buttons = (JSON.stringify(tree).match(/"type":"button"/g) || []).length
  assert.ok(buttons >= cells.length, 'every heatmap day is a button (' + buttons + ' buttons)')
  // The detail table is grouped, not a flat session dump: one row per model,
  // each carrying its share of the total.
  assert.ok(text.includes('tu-share'), 'the grouped table draws share bars')
  assert.ok(text.includes('tu-share-fill'), 'each share bar has a fill')
  assert.ok(text.includes('Share'), 'the share column is labelled')
  const tabs = findAll(tree, 'tu-preset').map((node) => JSON.stringify(node.props.children))
  assert.ok(tabs.some((label) => label.includes('By model')), 'offers the model dimension')
  assert.ok(tabs.some((label) => label.includes('By session')), 'offers the session dimension')
  // A workspace dimension was tried and removed: the client session list row
  // carries no cwd, so every row fell into one anonymous group reading "100%".
  assert.ok(!tabs.some((label) => label.includes('workspace')), 'no workspace dimension is offered')
  console.log('[ok] settings: cards, range filter, adaptive heatmap and grouped share table all render')
}
{
  // The settings table is where the token report already lists a conversation,
  // so that is where its destructive action lives. Clicking it must call the
  // injected host operation for exactly that row.
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'session-alpha', title: 'Alpha session', at: now, model: 'deepseek-flash', usage: usage(2000, 4000, 800) },
  ])
  let called = null
  // The destructive action lives on the SESSION dimension only: deleting a
  // whole model or workspace from this table would not mean anything.
  const tree = render(Section, { sessions, deleteSession: async (id) => { called = id } }, { 11: 'session' })
  const button = findByClass(tree, 'tu-del')
  assert.ok(button, 'the settings table renders a delete button when the host operation is present')
  assert.equal(button.props.type, 'button', 'the delete action is a real button')
  assert.equal(typeof button.props.onClick, 'function', 'the delete button is wired')
  button.props.onClick({ stopPropagation() {} })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(called, 'session-alpha', 'the clicked row is the one deleted')
  console.log('[ok] settings: deleting a row calls the host operation for that session')
}
{
  // The client also owns a local ledger of observed spend. Deleting a
  // conversation must discard its entry, not merely hide the row.
  const seed = {
    'dsh-token-usage.spend.v3': JSON.stringify({
      v: 3,
      s: { 'session-alpha': { u: [1, 2, 3, 4], d: {}, b: [0, 0, 0, 0] } },
    }),
  }
  const calls = []
  const fakeFetch = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '' })
  }
  const loaded = loadBundle(makeStorage(seed), { fetch: fakeFetch })
  const { ctx, registered } = makeCtx()
  loaded.exported.apply(ctx)
  const panel = registered.find((entry) => entry.options.name === 'main')
  const injected = panel.options.inject()
  assert.equal(typeof injected.deleteSession, 'function', 'the panel seat exposes the delete operation')
  await injected.deleteSession('session-alpha')
  assert.equal(calls.length, 1, 'one delete request is sent')
  assert.ok(calls[0].url.includes('api/token-usage/delete-session'), 'the request targets the host delete route')
  assert.equal(calls[0].init.method, 'POST', 'the delete request is a POST')
  assert.equal(JSON.parse(calls[0].init.body).sessionId, 'session-alpha', 'the request names the session')
  const raw = loaded.store.data.get('dsh-token-usage.spend.v3')
  assert.ok(raw !== undefined && !raw.includes('session-alpha'), 'the deleted session leaves the local token ledger')
  console.log('[ok] settings: delete removes the local token ledger entry')
}
{
  // Clicking a heatmap cell must be wired to a handler, and the cell must
  // carry that day's figures so the drill-down has something to show.
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'session-alpha', title: 'Alpha session', at: now, model: 'deepseek-flash', usage: usage(2000, 4000, 800) },
  ])
  const tree = render(Section, { sessions })
  const heatBlock = tree.props.children[3]
  assert.equal(heatBlock.props.className, 'tu-group', 'the heatmap block is reachable in the tree')
  const heatmap = heatBlock.props.children[2]
  assert.ok(heatmap, 'the heatmap is rendered')
  const cells = heatCellsOf(heatmap)
  assert.equal(cells.length % 7, 0, 'the grid holds whole weeks')
  assert.ok(cells.length > 0 && cells.length <= 53 * 7, 'columns cover the real span, capped at a year')
  const past = cells.filter((cell) => cell.props && cell.props.onClick !== undefined)
  assert.ok(past.length > 0, 'at least one past cell is interactive')
  assert.equal(typeof past[0].props.onClick, 'function', 'a past cell carries a click handler')
  assert.ok(String(past[0].props.title).length > 0, 'the cell tooltip names the day and its usage')

  const future = cells.filter((cell) => cell.props && cell.props.disabled === true)
  const clickable = cells.filter((cell) => cell.props && cell.props.onClick !== undefined)
  assert.equal(clickable.length + future.length, cells.length, 'every cell is either clickable or disabled')
  assert.ok(clickable.length > 0, 'past days are clickable')
  // The grid ends on the current week's Saturday, so on a Saturday itself there
  // is no future day to disable. Asserting one exists made this test fail every
  // Saturday.
  if (new Date(now).getDay() !== 6) assert.ok(future.length > 0, 'days after today are disabled rather than clickable')
  console.log('[ok] settings: heatmap cells are clickable and carry a day summary')
}
{
  // The grid starts at the Monday of the week containing the FIRST recorded
  // day; a record that would run past the fixed window is still included.
  const now = Date.now()
  const today = dayStartLocal(now)
  const earliest = today - 35 * DAY
  const latest = today + 10 * DAY
  const firstMonday = mondayLocal(earliest)
  const bucket = { uncachedInputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const sessions = fakeSessions([{
    id: 'anchor', title: 'Anchor', at: now, model: 'deepseek-flash', usage: usage(1000, 0, 0),
    byDay: { [keyOfLocal(earliest)]: bucket, [keyOfLocal(latest)]: bucket },
  }])
  const tree = render(Section, { sessions })
  const heatmap = tree.props.children[3].props.children[2]
  const cells = heatCellsOf(heatmap)
  // The grid STARTS on the first recorded week (the "from when I started"
  // reading) and runs forward, Monday first.
  assert.equal(cells[0].props.key, keyOfLocal(firstMonday), 'the first column is the Monday of the first recorded week')
  for (let day = 0; day < 7; day += 1) {
    assert.equal(cells[day].props.key, keyOfLocal(firstMonday + day * DAY), 'rows run Monday through Sunday')
  }
  assert.ok(cells.some((cell) => cell.props.key === keyOfLocal(earliest)), 'the first record is inside the grid')
  // A full year is always drawn, so a future-dated record falls inside the
  // grid but is marked as future: it must never look like a real usage day.
  const futureCell = cells.find((cell) => cell.props.key === keyOfLocal(latest))
  if (futureCell) {
    assert.ok(String(futureCell.props.className).includes('future'), 'a future-dated cell is marked as future')
    assert.equal(futureCell.props.disabled, true, 'and is not interactive')
  }
  console.log('[ok] settings: the grid starts on the first recorded week, Monday first')
}
{
  // Once history outruns one window (52 weeks), the newest window shows first
  // and the paging controls walk back to the first record.
  const now = Date.now()
  const today = dayStartLocal(now)
  const earliest = today - 120 * 7 * DAY
  const lastMonday = mondayLocal(today)
  const autoStart = lastMonday - 52 * 7 * DAY
  const bucket = { uncachedInputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const sessions = fakeSessions([{
    id: 'long', title: 'Long history', at: now, model: 'deepseek-flash', usage: usage(1000, 0, 0),
    byDay: { [keyOfLocal(earliest)]: bucket, [keyOfLocal(today)]: bucket },
  }])
  const tree = render(Section, { sessions })
  const heatBlock = tree.props.children[3]
  const cells = heatCellsOf(heatBlock.props.children[2])
  assert.equal(cells.length, 53 * 7, 'a long history pages in whole 53-week (one year) windows')
  assert.equal(cells[0].props.key, keyOfLocal(autoStart), 'the initial view is the latest window')
  assert.equal(cells[cells.length - 1].props.key, keyOfLocal(lastMonday + 6 * DAY), 'the current week stays on the right edge')
  // Paging is discrete, the way Codex and Claude switch usage ranges: no
  // continuous slider, but explicit step and jump controls.
  const winBar = heatBlock.props.children[3]
  assert.ok(JSON.stringify(winBar).includes('tu-windownav'), 'a long history offers paging controls')
  assert.ok(!JSON.stringify(winBar).includes('tu-slider'), 'and never a continuous slider')
  const navButtons = findAll(winBar, 'tu-winbtn')
  assert.ok(navButtons.length >= 2, 'paging is reachable by buttons')
  assert.ok(String(winBar.props.children[1].props.children[0].props.title).length > 0, 'the jump control is labelled')
  console.log('[ok] settings: long history pages through year-sized windows with discrete controls')
}

// ------------------------------------------- cards follow the selected range
{
  const now = Date.now()
  const DAY = 86400000
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  const keyOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  const dayStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
  const today = dayStart(now)
  const old = today - 10 * DAY
  const bucket = (n) => ({ uncachedInputTokens: n, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })

  const sessions = fakeSessions([
    { id: 'range-recent', title: 'Recent', at: now, usage: usage(1000000, 0, 0), byDay: { [keyOf(today)]: bucket(1000000) } },
    { id: 'range-old', title: 'Old', at: old, usage: usage(3000000, 0, 0), byDay: { [keyOf(old)]: bucket(3000000) } },
  ])

  // Hook 4 is the range state. With no range every session counts.
  const allCards = render(Section, { sessions }).props.children[2]
  assert.ok(JSON.stringify(allCards.props.children[1]).includes('4M'), 'unfiltered, the total card sums every session')

  // The heatmap and the table already narrowed to the range; the cards must too,
  // or the page contradicts itself.
  const ranged = render(Section, { sessions }, { 8: { from: today - 6 * DAY, to: today } }).props.children[2]
  const totalCard = JSON.stringify(ranged.props.children[1])
  assert.ok(totalCard.includes('1M'), 'with a range the total card narrows to it')
  assert.ok(!totalCard.includes('4M'), 'and no longer reports the all-time figure')
  assert.ok(JSON.stringify(ranged).includes('In range'), 'the card is relabelled so a window is never called all time')
  console.log('[ok] settings: the cards answer for the selected range')
}
// ------------------------------------------- archived sessions are excluded
{
  const now = Date.now()
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const sessions = fakeSessions([
    { id: 'arch-keep', title: 'Kept', at: now, usage: usage(1000000, 0, 0) },
    { id: 'arch-gone', title: 'Filed away', at: now, usage: usage(3000000, 0, 0) },
  ])

  const all = render(Section, { sessions })
  assert.ok(JSON.stringify(all.props.children[2].props.children[1]).includes('4M'), 'an ordinary session counts')

  // Archiving is how a session is put away: the sidebar stops offering it, so a
  // metering page must stop answering for it too.
  const filtered = render(Section, { sessions, getWorkspaces: () => fakeWorkspaces(['arch-gone']) })
  const totalCard = JSON.stringify(filtered.props.children[2].props.children[1])
  assert.ok(totalCard.includes('1M'), 'an archived session leaves the totals')
  assert.ok(!totalCard.includes('4M'), 'and no longer contributes to them')
  assert.ok(!JSON.stringify(filtered).includes('Filed away'), 'and leaves the session table')

  // With every session filed away there is nothing to report at all.
  assert.equal(
    render(Side, { sessions, wide: true, getWorkspaces: () => fakeWorkspaces(['arch-keep', 'arch-gone']) }),
    null,
    'a fully archived list renders nothing'
  )
  console.log('[ok] sessions: archived sessions are excluded from every figure')
}

// ------------------------------------------- attribution to a calendar day
{
  const now = Date.now()
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  // The global Section shim below drives the report the page embeds.
  const barsOf = (tree) => tree.props.children[1].props.children
  const todayBar = (bars) => bars[bars.length - 1]
  const allEmpty = (bars) => bars.every((bar) => Number(bar.props.height) === 2)

  // A session that already had usage when it was first seen: when that usage
  // happened is not published anywhere a client can read, so it must not be
  // guessed onto a day. It is surfaced as a backlog instead.
  {
    const sessions = fakeSessions([{ id: 'backlog-session', title: 'Backlog', at: now, usage: usage(1000000, 0, 0) }])
    const bars = barsOf(render(Side, { sessions, wide: true }))
    assert.ok(allEmpty(bars), 'a pre-existing backlog fills no day cell')
    const text = JSON.stringify(render(Section, { sessions }))
    assert.ok(text.includes('A further'), 'the backlog is surfaced rather than hidden')
    assert.ok(text.includes('1M'), 'and its size is reported')
    console.log('[ok] attribution: a pre-existing backlog is never guessed onto a day')
  }

  // When the host publishes its per-day fold, it wins outright: the days are the
  // real ones and nothing is inferred, so no backlog is left over.
  {
    const pad = (n) => (n < 10 ? '0' + n : String(n))
    const keyOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
    const now2 = Date.now()
    const past = now2 - 3 * 86400000
    const sessions = fakeSessions([{
      id: 'exact-session', title: 'Exact', at: now2,
      usage: usage(1000000, 400000, 0, 0),
      byDay: {
        [keyOf(past)]: { uncachedInputTokens: 1000000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        [keyOf(now2)]: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 400000, cacheWriteTokens: 0 },
      },
    }])
    const bars = barsOf(render(Side, { sessions, wide: true }))
    assert.ok(!allEmpty(bars), 'the host days reach the calendar')
    assert.ok(Number(todayBar(bars).props.height) > 2, 'and today carries its exact share')
    const tree2 = render(Section, { sessions })
    const cards2 = tree2.props.children[2]
    assert.ok(JSON.stringify(cards2.props.children[1]).includes('400k'), 'the Today card shows the exact share')
    assert.ok(!JSON.stringify(tree2).includes('A further'), 'an exact split leaves no backlog')
    console.log('[ok] attribution: the host per-day fold wins over the ledger, exactly')
  }

  // History survives: a session last prompted on an earlier day keeps its
  // pre-existing usage on that day, so the calendar still shows the past.
  {
    const past = Date.now() - 3 * 86400000
    const sessions = fakeSessions([{ id: 'history-session', title: 'History', at: past, usage: usage(1000000, 0, 0) }])
    const bars = barsOf(render(Side, { sessions, wide: true }))
    assert.ok(!allEmpty(bars), 'an earlier day keeps its share of the history')
    assert.equal(Number(todayBar(bars).props.height), 2, 'and today stays empty')
    console.log('[ok] attribution: history is kept on the day the session was last prompted')
  }
  // Growth seen while running is credited to the day it was seen, and only that.
  {
    const id = 'growing-session'
    render(Side, { sessions: fakeSessions([{ id, title: 'Growing', at: now, usage: usage(1000000, 0, 0) }]), wide: true })
    const after = fakeSessions([{ id, title: 'Growing', at: now, usage: usage(1000000, 0, 250000) }])
    const bars = barsOf(render(Side, { sessions: after, wide: true }))
    assert.ok(Number(todayBar(bars).props.height) > 2, 'growth observed today fills today')
    const cards = render(Section, { sessions: after }).props.children[2]
    assert.ok(JSON.stringify(cards.props.children[1]).includes('250k'), 'the Today card reports the growth alone')
    assert.ok(JSON.stringify(cards.props.children[1]).includes('1.3M'), 'the All-time card still totals the session')
    console.log('[ok] attribution: growth is credited to the day it was observed (250k), not the total (1.3M)')
  }

  // A session that starts at zero has no backlog, so it is exact from its very
  // first token - which is why a zero-usage session is still baselined.
  {
    const id = 'fresh-session'
    render(Side, { sessions: fakeSessions([{ id, title: 'Fresh', at: now, usage: usage(0, 0, 0, 0) }]), wide: true })
    const after = fakeSessions([{ id, title: 'Fresh', at: now, usage: usage(0, 0, 400000) }])
    const bars = barsOf(render(Side, { sessions: after, wide: true }))
    assert.ok(Number(todayBar(bars).props.height) > 2, 'a session that started empty fills today')
    const cards = render(Section, { sessions: after }).props.children[2]
    assert.ok(JSON.stringify(cards.props.children[1]).includes('400k'), 'its whole spend is today, with no backlog')
    assert.ok(!JSON.stringify(cards).includes('A further'), 'and no backlog is reported')
    console.log('[ok] attribution: a session that started at zero is exact from its first token')
  }
}
// ------------------------------------------------- ledger persistence
{
  const now = Date.now()
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component

  render(Side, {
    sessions: fakeSessions([{ id: 'ledger-session', title: 'Ledger', at: now, usage: usage(1000000, 0, 0) }]),
    wide: true,
  })
  assert.ok(store.data.has('dsh-token-usage.spend.v3'), 'the ledger is written to storage')
  const written = JSON.parse(store.data.get('dsh-token-usage.spend.v3'))
  assert.equal(written.v, 3, 'the ledger carries its format version')
  assert.ok(written.s['ledger-session'], 'the observed session is in the ledger')
  assert.ok(Array.isArray(written.s['ledger-session'].b), 'its backlog is stored')
  assert.ok(written.s['ledger-session'].b[0] === 1000000, 'and holds the pre-existing amount')

  // A second load, seeded as if a previous run had already baselined the session
  // at 1M: the growth this run sees is today's alone, and the backlog stays put.
  const seeded = makeStorage({
    'dsh-token-usage.spend.v3': JSON.stringify({
      v: 3,
      s: { 'restored-session': { u: [1000000, 0, 0, 0], d: {}, b: [1000000, 0, 0, 0] } },
    }),
  })
  const second = loadBundle(seeded)
  const { ctx, registered } = makeCtx()
  second.exported.apply(ctx)
  // This bundle instance is separate, so extract its report from its own panel.
  const RestoredPage = registered.find((entry) => entry.options.name === 'main').component
  const sessions = fakeSessions([{ id: 'restored-session', title: 'Restored', at: now, usage: usage(1000000, 0, 250000) }])
  second.react.__reset()
  const outer = RestoredPage({ sessions })
  let restoredBoundary = null
  const walkBoundary = (node) => {
    if (restoredBoundary !== null || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) walkBoundary(item); return }
    if (node.type && node.type.name === 'MeterBoundary') { restoredBoundary = node; return }
    if (node.props) walkBoundary(node.props.children)
  }
  walkBoundary(outer.props.children)
  assert.ok(restoredBoundary, 'the restored bundle renders its page with the report inside')
  second.react.__reset()
  const restoredInner = restoredBoundary.props.children
  second.react.__reset()
  const cards = restoredInner.type(restoredInner.props).props.children[2]
  assert.ok(JSON.stringify(cards.props.children[1]).includes('250k'), 'a restored ledger credits only the growth to today')
  assert.ok(JSON.stringify(cards.props.children[1]).includes('1.3M'), 'and still totals the whole session')
  console.log('[ok] persistence: a restored ledger credits only the growth to today')
  // A blank or not-yet-loaded list says nothing about which sessions still
  // exist. Treating it as authoritative once wiped the whole ledger and turned
  // every session into a backlog on the next render.
  {
    const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
    render(Side, { sessions: fakeSessions([{ id: 'kept-session', title: 'Kept', at: now, usage: usage(500000, 0, 0) }]), wide: true })
    render(Side, { sessions: fakeSessions([]), wide: true })
    render(Side, {})
    const ledger = JSON.parse(store.data.get('dsh-token-usage.spend.v3'))
    assert.ok(ledger.s['kept-session'], 'a blank session list never forgets a session')
    assert.ok(ledger.s['session-alpha'], 'nor does a missing sessions service')
    console.log('[ok] persistence: a blank session list never wipes the ledger')
  }
}
// ------------------------------------------------ sessions without usage
{
  // A session that never spent a token is dropped from every consumer: it
  // would otherwise add an all-zero row and inflate the session count.
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'session-used', title: 'Used session', at: now, model: 'deepseek-flash', usage: usage(2000, 4000, 800) },
    { id: 'session-empty', title: 'Empty session', at: now, usage: usage(0, 0, 0, 0) },
    { id: 'session-nousage', title: 'No projection', at: now },
  ])
  // The detail table groups by model by default, so read the SESSION dimension
  // to see which conversations survived - that is where they are named.
  const tree = render(Section, { sessions }, { 11: 'session' })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('Used session'), 'a session with usage is listed')
  assert.ok(!text.includes('Empty session'), 'an all-zero session is dropped from the table')
  assert.ok(!text.includes('No projection'), 'a session without the projection is dropped')
  assert.ok(text.includes('1 sessions'), 'the session count only counts sessions with usage')
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const card = render(Side, { sessions, wide: true })
  assert.ok(card, 'the sidebar card still renders')
  assert.ok(!JSON.stringify(card).includes('Empty session'), 'the sidebar ignores empty sessions too')
  console.log('[ok] sessions: all-zero and projection-less sessions are dropped everywhere')
}
{
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const onlyEmpty = fakeSessions([{ id: 'session-empty', title: 'Empty session', at: Date.now(), usage: usage(0, 0, 0, 0) }])
  assert.equal(render(Side, { sessions: onlyEmpty, wide: true }), null, 'only empty sessions -> nothing rendered')
  console.log('[ok] sessions: a list of only empty sessions renders nothing')
}

// -------------------------------------------------------- sidebar card
{
  // A host whose subscribe() returns something that is not a function must
  // degrade to an inert subscription, not crash the render on cleanup.
  const broken = { list: { subscribe: () => 'not a function', getSnapshot: () => ({ byId: {} }) } }
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  assert.equal(render(Side, { sessions: broken, wide: true }), null, 'a broken subscribe does not crash')
  // The global Section shim below drives the report the page embeds.
  const page = render(Section, { sessions: broken })
  assert.ok(page, 'the settings page still renders with a broken subscribe')
  console.log('[ok] host: a subscribe() that returns a non-function degrades quietly')
}

// -------------------------------------------------------- sidebar card
{
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'session-alpha', title: 'Alpha session', at: now, model: 'deepseek-flash', usage: usage(2000, 4000, 800) },
  ])
  const tree = render(Side, { sessions, wide: true })
  assert.ok(tree, 'the sidebar card renders')
  const text = JSON.stringify(tree)
  assert.ok(text.includes('tu-side'), 'uses the card styling')
  assert.ok(text.includes('Today'), 'shows today')
  assert.ok(text.includes('All time'), 'shows all time')
  assert.ok(!text.includes('\u00a5'), 'shows no money')
  assert.ok(text.includes('tu-spark'), 'draws the inline usage sparkline')
  assert.ok(text.includes('tu-spark-bar'), 'the sparkline is made of bars')
  const svg = tree.props.children[1]
  assert.equal(svg.type, 'svg', 'the second row is the sparkline svg')
  const bars = svg.props.children
  assert.equal(bars.length, 14, 'the sparkline shows a fortnight of bars')
  assert.equal(bars[0].type, 'rect', 'each bar is a rect')
  assert.equal(bars[0].props.role, 'button', 'each bar is announced as a button')
  assert.equal(typeof bars[0].props.onClick, 'function', 'each bar is clickable')
  assert.equal(typeof bars[0].props.onKeyDown, 'function', 'each bar is keyboard reachable')
  assert.ok(String(bars[0].props['aria-label']).length > 0, 'each bar carries a day label')
  assert.equal(bars[0].props.tabIndex, 0, 'each bar is in the tab order')
  // Clicking a bar toggles that day's line on, and clicking it again clears it.
  const toggled = bars[bars.length - 1].props.onClick
  assert.equal(typeof toggled, 'function', 'the last bar is clickable')
  console.log('[ok] sidebar: blue card, clickable sparkline bars, today and all time')
  // Hook 5 is the picked-day state; seeding it renders the drill-down line.
  const day = new Date(now)
  const dayKey = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0')
  const picked = render(Side, { sessions, wide: true }, { 9: dayKey })
  const pickedText = JSON.stringify(picked)
  assert.ok(pickedText.includes('tu-side-pick'), 'a picked day renders its own line')
  assert.ok(pickedText.includes('tu-spark-bar sel'), 'the picked bar is highlighted')
  assert.ok(pickedText.includes('6.8k'), 'the picked line carries that day\'s total')
  console.log('[ok] sidebar: picking a bar reveals that day\'s usage')
  // Selection is expressed by size, not by a focus ring.
  const plainBars = tree.props.children[1].props.children
  const seededBars = picked.props.children[1].props.children
  assert.equal(seededBars.length, plainBars.length, 'selection does not change the bar count')
  assert.ok(plainBars.every((bar) => !String(bar.props.className).includes('sel')), 'nothing is selected by default')
  const at = seededBars.findIndex((bar) => String(bar.props.className).includes('sel'))
  assert.ok(at >= 0, 'exactly one bar is marked selected')
  assert.equal(seededBars.filter((bar) => String(bar.props.className).includes('sel')).length, 1, 'only one bar is selected')
  assert.ok(Number(seededBars[at].props.height) > Number(plainBars[at].props.height), 'the picked bar grows taller')
  assert.ok(Number(seededBars[at].props.width) > Number(plainBars[at].props.width), 'the picked bar grows wider')
  assert.ok(plainBars.every((bar) => Number(bar.props.height) < 30), 'every bar keeps headroom to grow into')
  assert.equal(plainBars[plainBars.length - 1].props.key, dayKey, 'the sparkline ends on today, not on a future day')
  console.log('[ok] sidebar: the picked bar grows instead of gaining a focus ring')
}
{
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const tree = render(Side, { sessions: fakeSessions([]) })
  assert.equal(tree, null, 'an empty session list renders nothing rather than zeros')
  console.log('[ok] sidebar: empty list -> nothing rendered')
}
{
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  assert.equal(render(Side, {}), null, 'no sessions service -> nothing rendered')
  console.log('[ok] sidebar: no sessions service -> nothing rendered')
}
{
  // No timestamps anywhere: totals and the table survive, the calendar does not.
  const sessions = fakeSessions([
    { id: 'session-undated', title: 'Alpha session', usage: usage(2000, 4000, 800) },
  ])
  const tree = render(Section, { sessions }, { 11: 'session' })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('tu-cards'), 'cards still render without timestamps')
  assert.ok(text.includes('Alpha session'), 'the table still renders without timestamps')
  assert.ok(!text.includes('tu-heat-grid'), 'the heatmap is omitted when no session carries a date')
  console.log('[ok] settings: undated sessions -> cards and table only, no calendar')
}
{
  const tree = render(Section, { sessions: fakeSessions([]) })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('No sessions yet'), 'an empty list renders the empty state')
  assert.ok(text.includes('tu-cards'), 'cards still render for an empty list')
  console.log('[ok] settings: empty session list -> empty state, no throw')
}
{
  const tree = render(Section, {})
  assert.ok(tree, 'renders without a sessions service')
  assert.ok(JSON.stringify(tree).includes('exposes no session list'), 'degrades to an explanatory line')
  console.log('[ok] settings: no sessions service -> explanatory line, no throw')
}
{
  const sessions = { list: { subscribe: () => () => {}, getSnapshot: () => ({}) } }
  const tree = render(Section, { sessions })
  assert.ok(tree, 'renders when the list snapshot has no byId')
  console.log('[ok] settings: malformed session snapshot -> contained')
}

// ---------------------------------------- adaptive window and share table
{
  // A young history (the reported case: first use 9/30, ~8 weeks) must NOT be
  // rendered in a 26-week frame, and must offer no window control at all.
  const now = Date.now()
  const dayStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  const keyOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  const today = dayStart(now)
  const first = today - 56 * DAY
  const bucket = (n) => ({ uncachedInputTokens: n, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  const sessions = fakeSessions([{
    id: 'young', title: 'Young history', at: now, model: 'deepseek-flash', usage: usage(1000, 0, 0),
    byDay: { [keyOf(first)]: bucket(500), [keyOf(today)]: bucket(500) },
  }])
  const tree = render(Section, { sessions })
  const heatBlock = tree.props.children[3]
  const cells = heatCellsOf(heatBlock.props.children[2])
  // The frame is ALWAYS a full year of fixed-size cells. A young history does
  // not shrink it: the weeks before the first record are simply empty, so the
  // calendar keeps one shape as data accumulates.
  assert.ok(cells.length > 0 && cells.length <= 53 * 7, 'columns cover the real span, capped at a year')
  // The frame ends at the latest recorded week and spans a full year back, so
  // the weeks before the first record are simply empty cells.
  const dead = cells.filter((cell) => String(cell.props.key) < keyOf(first))
  assert.ok(dead.length > 0, 'the weeks before the first record are empty, not compressed away')
  const firstCellWeek = cells.findIndex((cell) => String(cell.props.key) === keyOf(first))
  assert.ok(firstCellWeek >= 0, 'the first record still appears in the grid')
  // The newest recorded week is on the right edge, so recent data never needs
  // scrolling to find.
  const lastCell = cells[cells.length - 1]
  assert.ok(String(lastCell.props.key) >= keyOf(today), 'the grid ends at or after today')
  // Today carries a marker so "now" is findable without reading the axis.
  const todayCell = cells.find((cell) => String(cell.props.key) === keyOf(today))
  assert.ok(String(todayCell.props.className).includes('today'), 'today is marked')
  const winBar = heatBlock.props.children[3]
  assert.ok(!JSON.stringify(winBar).includes('tu-windownav'), 'a year of history has nothing to page')
  assert.ok(!JSON.stringify(winBar).includes('tu-slider'), 'and no slider to drag')
  console.log('[ok] window: a full year of fixed-size cells, today marked, no paging within a year')
}
{
  // The share table must add up: every group's share is its slice of the
  // range total, and the bars carry that same figure.
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'm1', title: 'A', at: now, model: 'model-a', usage: usage(750000, 0, 0) },
    { id: 'm2', title: 'B', at: now, model: 'model-b', usage: usage(250000, 0, 0) },
  ])
  const tree = render(Section, { sessions })
  const bars = findAll(tree, 'tu-share-pct').map((node) => String(node.props.children))
  assert.ok(bars.includes('75%'), 'the heavier model reads 75%')
  assert.ok(bars.includes('25%'), 'the lighter one reads 25%')
  assert.equal(bars.length, 2, 'one share row per model')
  console.log('[ok] share table: grouped rows carry their share of the range total')
}
{
  // The today card must be framed against a reference, the way Claude frames
  // usage - a bare token count does not say whether it is a lot.
  const now = Date.now()
  const dayStart = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
  const pad = (n) => (n < 10 ? '0' + n : String(n))
  const keyOf = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
  const today = dayStart(now)
  const bucket = (n) => ({ uncachedInputTokens: n, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  const days = {}
  for (let i = 1; i <= 7; i += 1) days[keyOf(today - i * DAY)] = bucket(1000000)
  days[keyOf(today)] = bucket(2000000)
  const sessions = fakeSessions([{ id: 'base', title: 'Base', at: now, usage: usage(2000000, 0, 0), byDay: days }])
  const tree = render(Section, { sessions })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('vs'), 'the report frames today against a reference')
  assert.ok(text.includes('1M'), 'and names the trailing daily mean')
  console.log('[ok] baseline: today is framed against the trailing daily average')
}

// ------------------------------------------------ the full page panel seat
{
  // The main-column panel is the big surface: it must render the same report
  // inside a page heading, without any modal/portal wrapper.
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'page-a', title: 'Page session', at: now, model: 'deepseek-flash', usage: usage(2000000, 0, 0) },
  ])
  const Page = happyRegistered.find((entry) => entry.options.name === 'main').component
  // UsagePage wraps the boundary directly (no extra component), so read the
  // boundary's child instead of going through the two-layer render helper.
  react.__reset()
  const outer = Page({ sessions })
  const tree = outer.props.children
  assert.ok(tree, 'the full panel renders')
  const text = JSON.stringify(tree)
  assert.ok(text.includes('tu-page'), 'it is a page, not a floating card')
  assert.ok(text.includes('tu-page-h'), 'it carries a page heading')
  assert.ok(text.includes('Token usage'), 'the heading follows the locale')
  assert.ok(!text.includes('tu-panel'), 'no modal panel is involved')
  // The page wraps the very same report component, so there is one
  // implementation behind both the settings section and this page.
  const pageDiv = outer.props.children
  const innerSections = []
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (node.type && node.type.name === 'MeterBoundary') innerSections.push(node)
    if (node.props) walk(node.props.children)
  }
  walk(pageDiv)
  assert.ok(innerSections.length >= 1, 'the page embeds the report behind its own boundary')
  react.__reset()
  const report = innerSections[0].props.children
  react.__reset()
  const rendered = report.type(report.props)
  assert.ok(JSON.stringify(rendered).includes('tu-cards'), 'and the embedded report is the settings page itself')
  console.log('[ok] panel: the main-column page renders the report under a page heading')
}
{
  // The sidebar icon is drawn at whatever edge the owner row asks for.
  const Icon = happyRegistered.find((entry) => entry.options.name === 'sidebar.panellist').component
  const small = Icon({ size: 16, active: false })
  const large = Icon({ size: 24, active: true })
  assert.ok(small, 'the panel icon renders')
  assert.equal(small.props.width, 16, 'it honours the requested edge')
  assert.equal(large.props.width, 24, 'and follows a different request')
  assert.equal(small.props['aria-hidden'], true, 'it is decorative: the row supplies the label')
  assert.equal(small.props.children.length, 3, 'it draws the same three-bar mark as the reading')
  // A host that supplies no size must not produce an invalid icon.
  const fallback = Icon({})
  assert.ok(Number(fallback.props.width) > 0, 'a missing size falls back to a valid edge')
  console.log('[ok] panel icon: drawn at the owner-supplied edge, decorative, three bars')
}

// ---------------------------------------- window framing and card honesty
{
  // The grid is a FULL YEAR laid out from the first recorded week: always 53
  // columns, so it fills a wide pane at a constant tile size instead of
  // shrinking to the data and leaving a dead margin on the right. Weeks after
  // today are present but marked future and are not interactive.
  const now = Date.now()
  const today = dayStartLocal(now)
  const first = today - 63 * DAY
  const bucket = { uncachedInputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const sessions = fakeSessions([{
    id: 'paused', title: 'Paused', at: first, model: 'deepseek-flash', usage: usage(1000, 0, 0),
    byDay: { [keyOfLocal(first)]: bucket },
  }])
  const tree = render(Section, { sessions })
  const cells = heatCellsOf(tree.props.children[3].props.children[2])
  assert.equal(cells.length, 53 * 7, 'a full year of columns is always drawn')
  assert.equal(cells[0].props.key, keyOfLocal(mondayLocal(first)), 'column one is the first recorded week')
  const todayCell = cells.find((cell) => String(cell.props.key) === keyOfLocal(today))
  assert.ok(todayCell, 'today is inside the grid')
  assert.ok(String(todayCell.props.className).includes('today'), 'and marked')
  // Everything after today is future: dimmed and not clickable.
  const after = cells.filter((cell) => String(cell.props.key) > keyOfLocal(today))
  assert.ok(after.length > 0, 'the year continues past today')
  assert.ok(after.every((cell) => String(cell.props.className).includes('future')), 'future cells carry their own class')
  assert.ok(after.every((cell) => cell.props.disabled === true), 'future cells are not interactive')
  console.log('[ok] window: a full year from the first recorded week, future weeks drawn but inert')
}
{
  // Cell size is solved at render from the measured pane, then clamped. The CSS
  // must NOT stretch columns with 1fr: that turned a short history into a few
  // enormous squares, which is exactly what made the grid unreadable.
  const css = source
  assert.ok(/grid-auto-columns:var\(--tu-cell-w/.test(css), 'columns take their edge from the render')
  assert.ok(!/minmax\(var\(--tu-cell-min[^)]*\),1fr\)/.test(css), 'columns never stretch with 1fr')
  assert.ok(!/grid-auto-columns:var\(--tu-cell,11px\)/.test(css), 'the old fixed 11px column is gone')
  // The solver itself: a short history gets a capped tile, a long one the floor.
  const src = css
  assert.ok(/const CELL_MIN = 12/.test(src) && /const CELL_MAX = 40/.test(src), 'the solver clamps both ends')
  assert.ok(/Math\.max\(CELL_MIN, Math\.min\(CELL_MAX, share\)\)/.test(src), 'the share is clamped into the range')
  console.log('[ok] heatmap: cell edge solved from the pane and clamped, never stretched')
}
{
  // No "this session" card: the page is root-scoped, so the host supplies no
  // active-session id and the card could only guess (it used the newest).
  const now = Date.now()
  const sessions = fakeSessions([
    { id: 'newest', title: 'Newest', at: now, model: 'deepseek-flash', usage: usage(9000000, 0, 0) },
    { id: 'older', title: 'Older', at: now - 5 * DAY, model: 'deepseek-flash', usage: usage(1000000, 0, 0) },
  ])
  const tree = render(Section, { sessions })
  const cards = tree.props.children[2]
  assert.equal(cards.props.children.length, 2, 'exactly two cards: today and the range total')
  const text = JSON.stringify(cards)
  assert.ok(!text.includes('This session'), 'no this-session card is rendered')
  console.log('[ok] cards: two honest cards, no this-session guess')
}

{
  // The hover scale used to be clipped by the scroller's overflow-y:hidden,
  // which showed up as a stray cut-off line above the first row. The scroller
  // must not clip vertically, and the grow needs padding room.
  const css = source
  assert.ok(/\.tu-heat-scroll\{[^}]*overflow-y:visible/.test(css),
    'the heatmap scroller must not clip vertically')
  assert.ok(/\.tu-heat-scroll\{[^}]*padding:3px 0 2px/.test(css),
    'the scroller reserves room for the hover grow')
  assert.ok(!/\.tu-heat-scroll\{[^}]*overflow-y:hidden/.test(css),
    'the clipping that cut the top row is gone')
  // The grid starts at the first recorded week: a young history is NOT padded
  // on the left with a year of empty cells.
  const now = Date.now()
  const today = dayStartLocal(now)
  const first = today - 63 * DAY
  const bucket = { uncachedInputTokens: 500, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
  const sessions = fakeSessions([{
    id: 'young', title: 'Young', at: now, model: 'deepseek-flash', usage: usage(1000, 0, 0),
    byDay: { [keyOfLocal(first)]: bucket, [keyOfLocal(today)]: bucket },
  }])
  const tree = render(Section, { sessions })
  const cells = heatCellsOf(tree.props.children[3].props.children[2])
  const firstMonday = mondayLocal(first)
  assert.equal(cells[0].props.key, keyOfLocal(firstMonday), 'the grid opens on the first recorded week')
  // ...and still draws a whole year, because a grid that shrinks to the data
  // either stretches its few columns across the pane or leaves a dead margin.
  assert.equal(cells.length, 53 * 7, 'a short history still fills a full year of columns')
  const currentMonday = mondayLocal(today)
  assert.ok(cells.some((cell) => String(cell.props.key) === keyOfLocal(currentMonday)), 'the current week is present')
  console.log('[ok] heatmap: no vertical clipping, a full year laid out from the first recorded week')
}

{
  // The cell-edge solver is the whole fix for "the grid looks broken": with few
  // columns it must cap the tile instead of stretching it, and with many it must
  // fall back to the minimum and let the scroller handle the overflow.
  const solve = (() => {
    const start = source.indexOf('function cellEdgeFor(')
    assert.ok(start >= 0, 'the solver is present in the bundle')
    const end = source.indexOf('\n    }', start)
    assert.ok(end > start, 'the solver body is closed')
    // Rebuild it from the shipped source so the test exercises the real logic.
    const body = source.slice(start, end + 6)
    const CELL_MIN = 12
    const CELL_MAX = 40
    const CELL_GAP = 3
    // eslint-disable-next-line no-new-func
    const fn = new Function('CELL_MIN', 'CELL_MAX', 'CELL_GAP', body + '; return cellEdgeFor')
    return fn(CELL_MIN, CELL_MAX, CELL_GAP)
  })()
  // A nine-week history in a 900px pane: sharing 900px would give ~97px tiles,
  // so the cap must apply.
  // The grid is always a year of columns, so the solver is driven by 53.
  assert.equal(solve(900, 53), 14, 'a year shares a 900px pane')
  // A wide pane lets the year fill it: 1200px / 53 - gutters stays under the cap.
  assert.equal(solve(1200, 53), 19, 'a wide pane grows the tiles')
  // An ultra-wide pane must still cap the tile rather than produce blocks.
  assert.equal(solve(4000, 53), 40, 'an ultra-wide pane caps the tile')
  // A cramped pane falls to the floor rather than becoming unreadable.
  assert.equal(solve(300, 53), 12, 'a cramped pane keeps the minimum edge')
  // No measurement yet: the floor is always a valid answer.
  assert.equal(solve(0, 53), 12, 'before measuring, the minimum is used')
  console.log('[ok] heatmap: the cell edge is capped for short histories and floored for long ones')
}

// ------------------------------------------------------------ crash guard
{
  const boom = new Error('projection subsystem exploded')
  assert.throws(() => render(Dock, { useProjection: () => { throw boom } }), /exploded/,
    'a throwing projection propagates out of the reading...')
  const Boundary = outerOf(Dock, dockProps).type
  assert.equal(Boundary.name, 'MeterBoundary', 'the boundary is what gets registered')
  // The bundle runs in its own vm realm, so compare the field, not the object.
  assert.equal(Boundary.getDerivedStateFromError(boom).failed, true,
    '...and the boundary turns it into a silent failure')
  const instance = new Boundary({})
  instance.state = { failed: true }
  assert.equal(instance.render(), null, 'a failed boundary renders nothing, not a placeholder')
  console.log('[ok] crash guard: a throwing projection is absorbed and renders nothing')
}

console.log('\nall checks passed')
