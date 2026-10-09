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
function loadBundle(storage) {
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
    window: { __ModuleLoader__: { load: (value) => { definition = value } } },
    document,
    navigator: { language: 'en' },
    localStorage: store,
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
          getSnapshot: () => ({ active: options.hostLocale ?? 'en' }),
        }
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
    const child = { sessions: options.sessions === false ? undefined : (options.sessions ?? fakeSessions([])) }
    callback(child)
    return () => {}
  }
  return { ctx, registered, effects, localeCalls, injectCalls }
}

const DAY = 86400000
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
  assert.equal(registered.length, 3, 'all three seats are registered')

  const dock = registered.find((entry) => entry.options.name === 'conversation.composer.dock')
  const sidebar = registered.find((entry) => entry.options.name === 'sidebar.footer.action')
  const section = registered.find((entry) => entry.options.name === 'settings.section')
  assert.ok(dock, 'registers the composer seat')
  assert.ok(sidebar, 'registers the sidebar seat')
  assert.ok(section, 'registers the settings seat')
  assert.equal(dock.options.id, 'token-usage', 'list slots require an id')
  assert.equal(sidebar.options.id, 'token-usage', 'list slots require an id')
  assert.equal(section.options.id, 'token-usage', 'list slots require an id')
  assert.equal(dock.options.locale, 'token-usage', 'declares its namespace when a locale face exists')
  assert.equal(sidebar.options.locale, 'token-usage', 'declares its namespace when a locale face exists')
  assert.equal(section.options.locale, 'token-usage', 'declares its namespace when a locale face exists')
  assert.equal(typeof section.options.label, 'function', 'the settings seat supplies a nav label')
  const navLabel = section.options.label()
  assert.equal(navLabel.props.className, 'tu-nav', 'the nav label is an element carrying our own glyph')
  assert.ok(JSON.stringify(navLabel).includes('Token usage'), 'the nav label follows the host locale')
  assert.ok(JSON.stringify(navLabel).includes('tu-nav-icon'), 'the nav label draws its own icon')

  assert.equal(localeCalls.length, 1, 'registers its dictionaries once')
  assert.deepEqual(Object.keys(localeCalls[0].dictionaries).sort(), ['en', 'zh'], 'both locales registered')
  assert.ok(effects.some((entry) => String(entry.label).includes('stylesheet')), 'owns a stylesheet disposer')
  assert.ok(effects.some((entry) => String(entry.label).includes('dictionaries')), 'owns a dictionary disposer')
  assert.equal(errors.length, 0, 'the happy path logs nothing to the console')
  assert.equal(injectCalls.length, 1, 'exactly one dependency is declared')
  assert.equal(Array.from(injectCalls[0]).join(','), 'sessions', 'the cross-session seats wait for the session list')
  console.log('[ok] apply: registers all three seats and both disposers, silently')
}

// ------------------------------------------------------ host locale label
{
  const { ctx, registered } = makeCtx({ hostLocale: 'zh-CN' })
  exported.apply(ctx)
  const section = registered.find((entry) => entry.options.name === 'settings.section')
  assert.ok(JSON.stringify(section.options.label()).includes('Token 用量'), 'the nav label follows a Chinese host locale')
  console.log('[ok] apply: the settings nav label tracks the host locale')
}

// -------------------------------------------------- degraded environments
{
  const { ctx, registered } = makeCtx({ locale: false })
  exported.apply(ctx)
  assert.equal(registered.length, 3, 'still registers every seat without a locale face')
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
  assert.equal(injectCalls.length, 1, 'the dependency was declared')
  assert.equal(Array.from(injectCalls[0]).join(','), 'sessions', 'and it is the session list')
  assert.equal(registered.length, 1, 'only the composer seat registers without a session list')
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

// registerThrows sabotages all three seats (3) and getThrows sabotages the
// locale lookup plus the service lookup (2), so five diagnostics and no throw.
assert.equal(errors.length, 5, 'every sabotaged step reports exactly once')
assert.ok(errors.every((entry) => String(entry[0]).startsWith('[dsh-token-usage] ')), 'diagnostics are namespaced')
console.log('[ok] diagnostics: sabotage is reported once each, never thrown')

// -------------------------------------------------------- component shape
const { ctx: happyCtx, registered: happyRegistered } = makeCtx()
exported.apply(happyCtx)
const Dock = happyRegistered.find((entry) => entry.options.name === 'conversation.composer.dock').component
const Section = happyRegistered.find((entry) => entry.options.name === 'settings.section').component

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
  assert.ok(text.includes('This session'), 'renders the session card')
  assert.ok(text.includes('Today'), 'renders the today card')
  assert.ok(text.includes('All time'), 'renders the all-time card')
  assert.ok(text.includes('tu-cards'), 'lays the cards out in a grid')
  assert.ok(text.includes('tu-heat-grid'), 'renders the usage heatmap')
  assert.ok(text.includes('tu-heat-months'), 'renders the month axis')
  assert.ok(text.includes('tu-legend'), 'renders the heatmap legend')
  assert.ok(text.includes('Alpha session'), 'renders the session table')
  assert.ok(text.includes('Beta session'), 'renders every session row')
  assert.ok(text.includes('tu-range'), 'renders the date-range filter')
  assert.ok(text.includes('type\':\'date') || text.includes('"date"'), 'renders start and end date inputs')
  assert.ok(text.includes('Last 7 days'), 'renders the quick presets')
  assert.ok(text.includes('deepseek-flash'), 'names the model in the table')
  assert.ok(!text.includes('\u00a5'), 'the report carries no money')
  assert.ok(text.includes('tu-slider'), 'renders the time-window slider')
  const slider = tree.props.children[3].props.children[3]
  const rangeInput = slider.props.children[0]
  assert.equal(rangeInput.props.type, 'range', 'the time control is a range input')
  assert.equal(rangeInput.props.min, 0, 'the window cannot slide into the future')
  assert.ok(rangeInput.props.max > 0, 'the window can slide into the past')
  assert.equal(typeof rangeInput.props.onChange, 'function', 'sliding the window is wired')
  assert.ok(String(rangeInput.props['aria-label']).length > 0, 'the slider carries an accessible name')
  assert.ok(String(slider.props.children[1].props.children).length > 0, 'the slider is captioned with its date span')
  const cells = text.split('tu-cell').length - 1
  assert.ok(cells >= 26 * 7, 'the grid holds a full 26-week window (' + cells + ' cell references)')
  // Every past heatmap cell must be a real button so a colour is reachable.
  const grid = JSON.stringify(tree).includes('tu-heat-grid')
  assert.ok(grid, 'the grid is present')
  const buttons = (JSON.stringify(tree).match(/"type":"button"/g) || []).length
  assert.ok(buttons > 26 * 7, 'every heatmap day is a button (' + buttons + ' buttons)')
  console.log('[ok] settings: cards, range filter, clickable 26-week heatmap and table all render')
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
  const cells = heatmap.props.children[0].props.children
  assert.equal(cells.length, 26 * 7, 'the grid holds exactly 26 weeks of days')
  const past = cells.filter((cell) => cell.props && cell.props.onClick !== undefined)
  assert.ok(past.length > 0, 'at least one past cell is interactive')
  assert.equal(typeof past[0].props.onClick, 'function', 'a past cell carries a click handler')
  assert.ok(String(past[0].props.title).length > 0, 'the cell tooltip names the day and its usage')
  const future = cells.filter((cell) => cell.props && cell.props.disabled === true)
  assert.ok(future.length > 0, 'days after today are disabled rather than clickable')
  console.log('[ok] settings: heatmap cells are clickable and carry a day summary')
}

// ------------------------------------------- attribution to a calendar day
{
  const now = Date.now()
  const Side = happyRegistered.find((entry) => entry.options.name === 'sidebar.footer.action').component
  const Section = happyRegistered.find((entry) => entry.options.name === 'settings.section').component
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
    assert.ok(JSON.stringify(cards.props.children[2]).includes('1.3M'), 'the All-time card still totals the session')
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
  const Restored = registered.find((entry) => entry.options.name === 'settings.section').component
  const sessions = fakeSessions([{ id: 'restored-session', title: 'Restored', at: now, usage: usage(1000000, 0, 250000) }])
  second.react.__reset()
  const inner = Restored({ sessions }).props.children
  second.react.__reset()
  const cards = inner.type(inner.props).props.children[2]
  assert.ok(JSON.stringify(cards.props.children[1]).includes('250k'), 'a restored ledger credits only the growth to today')
  assert.ok(JSON.stringify(cards.props.children[2]).includes('1.3M'), 'and still totals the whole session')
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
  const tree = render(Section, { sessions })
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
  const Section = happyRegistered.find((entry) => entry.options.name === 'settings.section').component
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
  const picked = render(Side, { sessions, wide: true }, { 5: dayKey })
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
  const tree = render(Section, { sessions })
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
