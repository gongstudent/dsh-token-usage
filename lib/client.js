/**
 * dsh-token-usage - browser half.
 *
 * A read-only token usage view for DeepSeek Harness, in three seats:
 *
 *   - the composer row (conversation.composer.dock): a live one-line reading
 *     that expands into a per-bucket detail panel;
 *   - the sidebar footer (sidebar.footer.action): today / all-time totals;
 *   - Settings (settings.section): a date-ranged usage report with summary
 *     cards, a clickable 26-week heatmap, a per-day drill-down and a
 *     per-session table.
 *
 * Everything comes from data the harness already publishes - the token-meter
 * session projections, the model-selection projection and the client session
 * list - so this bundle computes nothing the harness does not already
 * compute, stores nothing, and talks to no host RPC surface.
 *
 * @module dsh-token-usage/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-token-usage',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const NS = 'token-usage'
    const DOCK_SLOT = 'conversation.composer.dock'
    const SIDEBAR_SLOT = 'sidebar.footer.action'
    const SECTION_SLOT = 'settings.section'
    const ENTRY_ID = 'token-usage'
    const DOCK_ORDER = 40
    const SIDEBAR_ORDER = 12
    const SECTION_ORDER = 40
    const CSS_TAG_ID = 'dsh-token-usage/client.css'
    const PANEL_WIDTH = 264
    const PANEL_GAP = 8
    const EDGE = 8
    /** The heatmap window, matching the harness' own usage grid. */
    const HEAT_WEEKS = 26
    const DAY_MS = 86400000


    //#region stylesheet
    const css = [
      // ---- composer reading ----
      '.tu-root{position:relative;display:inline-flex;flex:0 1 auto;min-width:0;max-width:100%;vertical-align:middle}',
      '.tu-trigger{display:inline-flex;align-items:center;gap:5px;max-width:100%;height:22px;margin:0;padding:0 6px;border:0;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-tertiary,#81858c);font:inherit;font-size:12px;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}',
      '.tu-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-secondary,#61666b)}',
      '.tu-trigger:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.tu-icon{flex:none;display:block}',
      '.tu-text{min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.tu-num{font-variant-numeric:tabular-nums}',
      // ---- expanded panel ----
      '.tu-panel{position:fixed;z-index:60;width:264px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#0f1115);box-shadow:var(--dsw-elevation-panel,0 3px 8px rgba(0,0,0,.06));font-size:12px;line-height:18px;text-align:left;overflow:auto}',
      '.tu-title{font-weight:600;margin-bottom:8px}',
      '.tu-block{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
      '.tu-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:1px 0}',
      '.tu-k{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#61666b)}',
      '.tu-v{flex:none;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-row-strong .tu-k{color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-row-strong .tu-v{font-weight:600;color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-sub .tu-k{padding-left:10px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-sub .tu-v{color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-bar{height:4px;margin:6px 0 2px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));overflow:hidden}',
      '.tu-bar-fill{height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-bar-fill.warn{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.tu-bar-fill.over{background:var(--dsw-alias-state-error-primary,#ec1313)}',
      '.tu-pct{text-align:right;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06))}',
      '.tu-stamp{color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-btn{font:inherit;font-size:12px;line-height:18px;margin:0;padding:2px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-secondary,#61666b);cursor:pointer}',
      '.tu-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.tu-slider{width:100%;margin:2px 0 0;accent-color:var(--dsw-alias-state-business-primary,#4d6bfe);cursor:pointer}',
      '.tu-window{font-size:11px;line-height:16px;text-align:center;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-nav{display:inline-flex;align-items:center;gap:6px;min-width:0}',
      '.tu-nav-icon{flex:none;display:block}',
      'button:has(.tu-nav)>svg{display:none}',
      // ---- sidebar card ----
      '.tu-side{display:flex;flex-direction:column;gap:6px;width:100%;min-width:0;box-sizing:border-box;padding:10px 12px 9px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-top:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-state-business-primary,#4d6bfe) 9%,transparent),transparent 66%),var(--dsw-alias-bg-layer-1,#fff);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary,#0f1115);overflow:hidden}',
      '.tu-side-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
      '.tu-side-brand{display:inline-flex;align-items:center;gap:5px;font-weight:600;color:var(--dsw-alias-label-secondary,#61666b)}',
      '.tu-side-brand .tu-icon{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-side-total{font-size:17px;line-height:24px;font-weight:600;color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-spark{display:block;width:100%;height:34px;overflow:visible}',
      '.tu-spark-bar{fill:var(--dsw-alias-state-business-primary,#4d6bfe);fill-opacity:.82;cursor:pointer;outline:none}',
      '.tu-spark-bar.empty{fill-opacity:.18}',
      '.tu-spark-bar:focus{outline:none}',
      '.tu-spark-bar.sel{fill:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-spark-bar:focus-visible{outline:none;stroke:var(--dsw-alias-brand-primary,#4d6bfe);stroke-width:2}',
      '.tu-side-line{display:flex;align-items:baseline;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-side-line b{font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-side-pick,.tu-side-pick b{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-side-rail{align-items:center;gap:2px;padding:6px}',
      '.tu-side-rail .tu-side-line{justify-content:center}',
      // ---- settings section ----
      '.tu-section{display:flex;flex-direction:column;gap:20px;padding:4px 2px 24px;font-size:13px;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-group{display:flex;flex-direction:column;gap:10px;min-width:0}',
      '.tu-h{margin:0;font-size:14px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-empty{margin:0;padding:8px 0;font-size:12px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      // ---- range filter ----
      '.tu-range{display:flex;align-items:center;flex-wrap:wrap;gap:8px}',
      '.tu-range label{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#61666b)}',
      '.tu-input{font:inherit;font-size:12px;line-height:18px;padding:3px 6px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-primary,#0f1115);color-scheme:light dark}',
      '.tu-input:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.tu-preset{font:inherit;font-size:12px;line-height:18px;margin:0;padding:3px 10px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#61666b);cursor:pointer}',
      '.tu-preset:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.tu-preset.active{background:var(--dsw-alias-state-business-primary,#4d6bfe);border-color:transparent;color:var(--dsw-alias-label-primary-inverted,#fff);font-weight:600}',
      '.tu-preset:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      // ---- summary cards ----
      '.tu-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
      '.tu-card{display:flex;flex-direction:column;gap:6px;min-width:0;box-sizing:border-box;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff)}',
      '.tu-card-k{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-card-v{font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-card-d{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c);overflow-wrap:anywhere}',
      // ---- heatmap ----
      '.tu-heat{display:flex;flex-direction:column;gap:6px;min-width:0}',
      '.tu-heat-grid{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);gap:3px;min-width:0}',
      '.tu-cell{width:100%;min-width:0;aspect-ratio:1/1;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));cursor:pointer}',
      '.tu-cell:disabled{cursor:default}',
      // Intensity is expressed with opacity on a solid brand fill, not with
      // color-mix(): the four steps carry information, so they must not depend
      // on a colour function a host engine might not support.
      '.tu-cell.l1{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.3}',
      '.tu-cell.l2{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.52}',
      '.tu-cell.l3{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.76}',
      '.tu-cell.l4{background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-cell.muted{filter:opacity(.38)}',
      '.tu-cell.sel{box-shadow:0 0 0 2px var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-cell:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.tu-heat-months{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:3px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-heat-month{overflow:visible;white-space:nowrap}',
      '.tu-legend{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-legend .tu-cell{width:10px;height:10px;aspect-ratio:auto;flex:none;cursor:default}',
      // ---- day detail ----
      '.tu-day{display:flex;flex-direction:column;gap:6px;box-sizing:border-box;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff)}',
      '.tu-day-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-weight:600}',
      // ---- table ----
      '.tu-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}',
      '.tu-table th,.tu-table td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.tu-table th{color:var(--dsw-alias-label-tertiary,#81858c);font-weight:500}',
      '.tu-table td.num,.tu-table th.num{text-align:right;font-variant-numeric:tabular-nums}',
      '.tu-table tr:last-child td{border-bottom:none}',
      '.tu-table tbody tr{cursor:pointer}',
      '.tu-table tbody tr:hover td{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.tu-table tbody tr.sel td{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.tu-table td.name{color:var(--dsw-alias-label-primary,#0f1115)}',
      '@media (max-width:640px){.tu-cards{grid-template-columns:minmax(0,1fr)}}',
      '@media (prefers-reduced-motion:reduce){.tu-trigger,.tu-btn{transition:none}}',
    ].join('')

    /**
     * Install the stylesheet, comparing CONTENT rather than identity.
     *
     * A client HMR swap replaces this bundle without reloading the page, so a
     * node from the previous release is still in the document. Skipping on
     * "a node with this id exists" would leave the new rules unapplied.
     */
    function injectCss() {
      if (typeof document === 'undefined' || document === null || document.head === undefined) return
      const existing = document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']')
      if (existing !== null && existing !== undefined && existing.textContent === css) return
      const tag = existing !== null && existing !== undefined ? existing : document.createElement('style')
      tag.dataset.plugin = 'dsh-token-usage'
      tag.dataset.pluginCss = CSS_TAG_ID
      tag.textContent = css
      if (existing === null || existing === undefined) document.head.appendChild(tag)
    }

    /**
     * Remove our own stylesheet, but only while it still holds OUR content: a
     * newer release's node must survive this instance's teardown.
     */
    function removeCss() {
      try {
        if (typeof document === 'undefined' || document === null) return
        const tag = document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']')
        if (tag !== null && tag !== undefined && tag.textContent === css && typeof tag.remove === 'function') tag.remove()
      } catch (error) {
        report(error, 'stylesheet removal')
      }
    }
    //#endregion

    //#region dictionaries
    /**
     * Bilingual copy. These keys are the complete set this bundle renders;
     * scripts/check.mjs asserts both dictionaries declare exactly the same
     * keys and the same placeholders, so a one-sided translation cannot ship.
     */
    const MESSAGES = {
      zh: {
        navLabel: 'Token 用量',
        title: 'Token 用量',
        panelTitle: '本会话 Token 用量',
        triggerAria: 'Token 用量:输入 {input},缓存 {cache},输出 {output}。点击查看明细',
        dockReading: '输入 {input} · 缓存 {cache} · 输出 {output}',
        uncachedInput: '未命中输入',
        cacheRead: '缓存读',
        cacheWrite: '缓存写',
        output: '输出',
        hitRate: '缓存命中率',
        noRate: '—',
        contextUsage: '上下文占用',
        bdSystem: '系统提示',
        bdTools: '工具定义',
        bdMessages: '对话',
        refreshedAt: '刷新于 {time}',
        refresh: '刷新',
        rangeFrom: '起始',
        rangeTo: '结束',
        rangeAll: '全部',
        range7: '近 7 天',
        range30: '近 30 天',
        rangeSummary: '所选范围 {sessions} 个会话 · {tokens} tokens',
        windowLabel: '时间窗口',
        windowRange: '{from} 至 {to}',
        windowWeeks: '截至 {weeks} 周前',
        sparkAria: '近 14 天用量,点柱子查看当天',
        cardSession: '本会话',
        cardToday: '今日',
        cardTotal: '累计',
        cardDetail: '输入 {input} · 缓存 {cache} · 输出 {output}',
        cardSessions: '{count} 个会话',
        heatTitle: 'Token 用量统计',
        heatTotal: '累计 {total} tokens · 输入 {input} · 缓存 {cache} · 输出 {output}',
        carry: '另有 {tokens} tokens 是插件第一次看到这些会话之前就花掉的（{sessions} 个会话），落在哪一天无法得知，因此不进日历。',
        heatLess: '少',
        heatMore: '多',
        heatCell: '{date} · {total} tokens',
        dayTitle: '当日明细',
        dayNone: '这天没有记录',
        tableTitle: '按会话',
        colSession: '会话',
        colDay: '日期',
        colModel: '模型',
        colInput: '输入 tok',
        colCache: '缓存 tok',
        colOutput: '输出 tok',
        colTotal: '合计 tok',
        noSessions: '还没有会话记录',
        unavailable: '此版本未提供会话列表,仅显示本会话读数',
      },
      en: {
        navLabel: 'Token usage',
        title: 'Token usage',
        panelTitle: 'Session token usage',
        triggerAria: 'Token usage: {input} in, {cache} cached, {output} out. Click for details.',
        dockReading: 'In {input} · Cache {cache} · Out {output}',
        uncachedInput: 'Uncached input',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        output: 'Output',
        hitRate: 'Cache hit rate',
        noRate: '—',
        contextUsage: 'Context usage',
        bdSystem: 'System prompt',
        bdTools: 'Tool schemas',
        bdMessages: 'Conversation',
        refreshedAt: 'Refreshed {time}',
        refresh: 'Refresh',
        rangeFrom: 'From',
        rangeTo: 'To',
        rangeAll: 'All',
        range7: 'Last 7 days',
        range30: 'Last 30 days',
        rangeSummary: '{sessions} sessions in range · {tokens} tokens',
        windowLabel: 'Time window',
        windowRange: '{from} to {to}',
        windowWeeks: 'Ending {weeks} weeks back',
        sparkAria: 'Last 14 days; click a bar for that day',
        cardSession: 'This session',
        cardToday: 'Today',
        cardTotal: 'All time',
        cardDetail: 'In {input} · Cache {cache} · Out {output}',
        cardSessions: '{count} sessions',
        heatTitle: 'Token usage',
        heatTotal: '{total} tokens total · In {input} · Cache {cache} · Out {output}',
        carry: 'A further {tokens} tokens were already spent before this plugin first saw those sessions ({sessions} of them). Which day they belong to cannot be known, so they stay out of the calendar.',
        heatLess: 'Less',
        heatMore: 'More',
        heatCell: '{date} · {total} tokens',
        dayTitle: 'Day detail',
        dayNone: 'Nothing recorded on this day',
        tableTitle: 'By session',
        colSession: 'Session',
        colDay: 'Day',
        colModel: 'Model',
        colInput: 'Input tok',
        colCache: 'Cache tok',
        colOutput: 'Output tok',
        colTotal: 'Total tok',
        noSessions: 'No sessions yet',
        unavailable: 'This version exposes no session list; showing this session only',
      },
    }

    /** Browser-language fallback, used only when the host injects no t. */
    function fallbackT(key, vars) {
      let locale = 'en'
      try {
        const language = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language.toLowerCase() : ''
        if (language.indexOf('zh') === 0) locale = 'zh'
      } catch (error) {
        locale = 'en'
      }
      const dict = locale === 'zh' ? MESSAGES.zh : MESSAGES.en
      let text = dict[key] !== undefined ? dict[key] : MESSAGES.en[key] !== undefined ? MESSAGES.en[key] : key
      if (vars) for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
      return text
    }
    //#endregion

    //#region numeric helpers
    /** Coerce anything to a finite non-negative number. */
    function num(value) {
      const parsed = Number(value)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }

    /** Compact count: 842 / 12.4k / 1.3M. */
    function formatCount(value) {
      const total = num(value)
      if (total < 1000) return String(Math.round(total))
      const scale = (candidate) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10))
      if (total < 1000000) return scale(total / 1000) + 'k'
      return scale(total / 1000000) + 'M'
    }

    /** A fresh, all-zero bucket set. */
    function zeroUsage() {
      return { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    }

    /** All four buckets, which are disjoint by contract. */
    function totalTokens(usage) {
      return num(usage.uncachedInputTokens) + num(usage.outputTokens) + num(usage.cacheReadTokens) + num(usage.cacheWriteTokens)
    }

    /** Add one bucket set into another, in place. */
    function addInto(target, usage) {
      target.uncachedInputTokens += num(usage.uncachedInputTokens)
      target.outputTokens += num(usage.outputTokens)
      target.cacheReadTokens += num(usage.cacheReadTokens)
      target.cacheWriteTokens += num(usage.cacheWriteTokens)
      return target
    }

    /**
     * Cache hit rate over BILLED INPUT, matching the harness' own definition:
     * cache writes belong in the denominator but are not hits. A zero
     * denominator yields null, which renders as an em dash.
     */
    function hitRateText(usage) {
      const read = num(usage.cacheReadTokens)
      const denominator = read + num(usage.uncachedInputTokens) + num(usage.cacheWriteTokens)
      if (denominator <= 0) return null
      return (read / denominator * 100).toFixed(1) + '%'
    }

    /** Local clock for the refresh stamp. */
    function clockText(at) {
      try {
        return new Date(at).toLocaleTimeString()
      } catch (error) {
        return ''
      }
    }

    /** Never let diagnostics become the failure they are reporting. */
    function report(error, where) {
      try {
        if (typeof console !== 'undefined' && console !== null && typeof console.error === 'function') {
          console.error('[dsh-token-usage] ' + where + ' failed:', error)
        }
      } catch (ignored) {
        // A host without a usable console is not a reason to throw.
      }

    }


    /** A projection hook that is always absent, keeping hook order stable. */
    function useNoProjection() {
      return undefined
    }
    //#endregion


    //#region dates
    /** Local calendar day key, YYYY-MM-DD. */
    function dayKeyOf(at) {
      const date = new Date(at)
      const month = date.getMonth() + 1
      const day = date.getDate()
      const monthText = month < 10 ? '0' + String(month) : String(month)
      const dayText = day < 10 ? '0' + String(day) : String(day)
      return String(date.getFullYear()) + '-' + monthText + '-' + dayText
    }

    /** Local midnight of the day containing the instant. */
    function dayStartOf(at) {
      const date = new Date(at)
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
    }

    /** Parse a YYYY-MM-DD input value into a local midnight, or null. */
    function parseDayKey(key) {
      if (typeof key !== 'string') return null
      const parts = key.split('-')
      if (parts.length !== 3) return null
      const year = Number(parts[0])
      const month = Number(parts[1])
      const day = Number(parts[2])
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
      if (month < 1 || month > 12 || day < 1 || day > 31) return null
      const at = new Date(year, month - 1, day).getTime()
      return Number.isFinite(at) ? at : null
    }

    /** Short localized day label; falls back to the key when Intl is unavailable. */
    function dayLabel(at, locale) {
      try {
        return new Date(at).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
      } catch (error) {
        return dayKeyOf(at)
      }
    }

    /** Full localized date for the day-detail header. */
    function fullDayLabel(at, locale) {
      try {
        return new Date(at).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
      } catch (error) {
        return dayKeyOf(at)
      }
    }

    /** Short localized month label for a heatmap column. */
    function monthLabel(at, locale) {
      try {
        return new Date(at).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short' })
      } catch (error) {
        return ''
      }
    }
    //#endregion

    //#region session aggregation
    /** The first finite, positive instant among the candidates. */
    function firstInstant(candidates) {
      for (const candidate of candidates) {
        const value = Number(candidate)
        if (Number.isFinite(value) && value > 0) return value
      }
      return null
    }

    /**
     * When the session last received a prompt.
     *
     * Only prompt stamps are consulted. Read and activity stamps - `updatedAt`,
     * `lastActivityAt`, `at` - are deliberately NOT candidates: they move when a
     * session is merely opened, so consulting them re-dates every token the
     * session ever spent onto whichever day it was last looked at.
     */
    function sessionPromptAt(summary) {
      const values = summary.projectionValues
      const meta = values == null ? undefined : values.sessionListMetadata
      const inner = meta == null ? undefined : meta.values
      return firstInstant([
        meta == null ? undefined : meta.lastPromptAt,
        inner == null ? undefined : inner.lastPromptAt,
        summary.lastPromptAt,
      ])
    }

    /**
     * The spending this app run has observed, keyed by session id.
     *
     * The session list publishes a cumulative total and the time of the last
     * prompt, but nothing about WHEN the tokens were spent - the list row does
     * not even carry the session's creation time (dsh-api-session-controller
     * spreads only parentSessionId/origin/cwd out of the header). Watching the
     * total grow is therefore the only evidence a client gets, so the plugin
     * remembers the last total it saw and credits the difference to the day it
     * saw it.
     *
     * Whatever already existed at first sight is placed on the session's last
     * prompt day: that part was spent before this run could observe anything,
     * and the last prompt is the earliest day the session is known to have been
     * active. Deliberately in-memory - the plugin persists nothing - so a restart
     * re-places each pre-existing lump and only growth seen while running is
     * credited to the day it actually happened.
     */
    /**
     * Where the observed spending is remembered between runs.
     *
     * A single localStorage key, browser-local: no host write, no RPC, no file.
     * The plugin still computes nothing the host has not already published; it
     * only remembers what it saw so a restart does not lose the attribution.
     */
    const SPEND_KEY = 'dsh-token-usage.spend.v2'

    /** Days older than this are dropped; the calendar never looks further back. */
    const SPEND_HORIZON_DAYS = 200

    const SPEND = loadSpend()
    let spendDirty = false

    /** Pack a usage record into a tuple, which is a third of the JSON size. */
    function toTuple(usage) {
      return [num(usage.uncachedInputTokens), num(usage.outputTokens), num(usage.cacheReadTokens), num(usage.cacheWriteTokens)]
    }

    /** Unpack a tuple written by {@link toTuple}. */
    function fromTuple(tuple) {
      return {
        uncachedInputTokens: num(tuple[0]),
        outputTokens: num(tuple[1]),
        cacheReadTokens: num(tuple[2]),
        cacheWriteTokens: num(tuple[3]),
      }
    }

    /**
     * Restore what previous runs observed.
     *
     * Anything unreadable or written by another version is discarded rather
     * than repaired: a wrong ledger is worse than an empty one.
     */
    function loadSpend() {
      const store = new Map()
      try {
        if (typeof localStorage === 'undefined' || localStorage === null) return store
        const raw = localStorage.getItem(SPEND_KEY)
        if (raw === null) return store
        const parsed = JSON.parse(raw)
        if (parsed == null || typeof parsed !== 'object' || parsed.v !== 2) return store
        const sessions = parsed.s
        if (sessions == null || typeof sessions !== 'object') return store
        for (const id of Object.keys(sessions)) {
          const entry = sessions[id]
          if (entry == null || !Array.isArray(entry.u) || entry.d == null || typeof entry.d !== 'object') continue
          const byDay = {}
          for (const key of Object.keys(entry.d)) {
            if (Array.isArray(entry.d[key])) byDay[key] = fromTuple(entry.d[key])
          }
          store.set(id, { usage: fromTuple(entry.u), byDay: byDay, backlog: Array.isArray(entry.b) ? fromTuple(entry.b) : zeroUsage() })
        }
      } catch (error) {
        report(error, 'load observed spending')
      }
      return store
    }

    /** Write the ledger back, but only when something actually changed. */
    function saveSpend() {
      if (!spendDirty) return
      spendDirty = false
      try {
        if (typeof localStorage === 'undefined' || localStorage === null) return
        const sessions = {}
        for (const entry of SPEND.entries()) {
          const days = {}
          for (const key of Object.keys(entry[1].byDay)) days[key] = toTuple(entry[1].byDay[key])
          sessions[entry[0]] = { u: toTuple(entry[1].usage), d: days, b: toTuple(entry[1].backlog) }
        }
        localStorage.setItem(SPEND_KEY, JSON.stringify({ v: 2, s: sessions }))
      } catch (error) {
        // A full or unavailable store must not break the readout.
        report(error, 'save observed spending')
      }
    }

    /** A detached copy of a usage record. */
    function cloneUsage(usage) {
      return {
        uncachedInputTokens: usage.uncachedInputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
      }
    }

    /** Add the growth between two usage records into a bucket. */
    function addDelta(bucket, next, previous) {
      bucket.uncachedInputTokens += Math.max(0, next.uncachedInputTokens - previous.uncachedInputTokens)
      bucket.outputTokens += Math.max(0, next.outputTokens - previous.outputTokens)
      bucket.cacheReadTokens += Math.max(0, next.cacheReadTokens - previous.cacheReadTokens)
      bucket.cacheWriteTokens += Math.max(0, next.cacheWriteTokens - previous.cacheWriteTokens)
    }

    /**
     * Credit a session's growth to today and return its per-day amounts.
     *
     * Idempotent: the stored baseline becomes the total just observed, so a
     * repeated call for the same list credits nothing twice.
     */
    function recordSpend(id, at, usage) {
      const total = totalTokens(usage)
      let seen = SPEND.get(id)
      if (seen === undefined) {
        // Everything already spent when this session was first seen happened at
        // a time nothing here can observe. Its per-day split is not published
        // anywhere a client can read - the list row does not even carry the
        // session's creation time - so it is recorded as a backlog rather than
        // guessed onto the day of the last prompt, which would be a wrong answer
        // written down permanently.
        seen = { usage: cloneUsage(usage), byDay: {}, backlog: cloneUsage(usage) }
        SPEND.set(id, seen)
        spendDirty = true
        return seen.byDay
      }
      if (total > totalTokens(seen.usage)) {
        const key = dayKeyOf(Date.now())
        const bucket = seen.byDay[key] === undefined ? zeroUsage() : seen.byDay[key]
        addDelta(bucket, usage, seen.usage)
        seen.byDay[key] = bucket
        spendDirty = true
      }
      // A total that shrank means the projection was rebuilt or the session was
      // reset; rebase rather than credit a negative amount to any day.
      if (total !== totalTokens(seen.usage)) spendDirty = true
      seen.usage = cloneUsage(usage)
      return seen.byDay
    }

    /**
     * The model a session used.
     *
     * The model-selection projection is the reliable source; the extra
     * spellings cover a projection value that arrives wrapped rather than
     * flattened. A session with no resolvable model is reported as unpriced
     * rather than charged at an unrelated rate.
     */
    function sessionModel(summary) {
      const values = summary.projectionValues
      if (values == null) return null
      const selection = values.modelSelection
      if (selection != null) {
        const direct = selection.lastUsed
        if (direct != null && typeof direct.model === 'string' && direct.model.length > 0) return direct.model
        const wrapped = selection.values
        if (wrapped != null && wrapped.lastUsed != null && typeof wrapped.lastUsed.model === 'string') return wrapped.lastUsed.model
      }
      if (typeof summary.model === 'string' && summary.model.length > 0) return summary.model
      const header = summary.header
      if (header != null && header.config != null && typeof header.config.model === 'string') return header.config.model
      return null
    }

    /** The session's durable token usage, or null when the projection is absent. */
    function sessionUsage(summary) {
      const values = summary.projectionValues
      if (values == null) return null
      const usage = values.tokenUsage
      if (usage == null) return null
      return {
        uncachedInputTokens: num(usage.uncachedInputTokens),
        outputTokens: num(usage.outputTokens),
        cacheReadTokens: num(usage.cacheReadTokens),
        cacheWriteTokens: num(usage.cacheWriteTokens),
      }
    }

    /**
     * Every session the client list knows about that carries a token-usage
     * projection, newest first when timestamps are available.
     */
    function collectSessions(list) {
      const byId = list == null ? undefined : list.byId
      if (byId == null || typeof byId !== 'object') return []
      const rows = []
      for (const key of Object.keys(byId)) {
        const summary = byId[key]
        if (summary == null) continue
        const usage = sessionUsage(summary)
        if (usage === null) continue
        const at = sessionPromptAt(summary)
        const id = typeof summary.id === 'string' && summary.id.length > 0 ? summary.id : key
        // Observe every session, including one that has not spent anything yet:
        // a session that starts at zero must be baselined at zero, or its first
        // real token would look like a backlog that predates the plugin.
        const byDay = recordSpend(id, at, usage)
        // A session that never spent a token contributes nothing to any total
        // and only adds an all-zero row to the table, so it is dropped here
        // rather than filtered again in every consumer.
        if (totalTokens(usage) <= 0) continue
        rows.push({
          id: id,
          title: typeof summary.title === 'string' ? summary.title : '',
          at: at,
          day: at === null ? null : dayKeyOf(at),
          model: sessionModel(summary),
          usage: usage,
          total: totalTokens(usage),
          byDay: byDay,
          backlog: SPEND.get(id).backlog,
        })
      }
      // Keep the ledger bounded by dropping days the calendar can no longer show.
      //
      // Sessions are deliberately NOT pruned for being absent from this list. The
      // list is not guaranteed to be the complete set - it can be blank while it
      // loads, or scoped to one workspace - and forgetting a session there would
      // destroy its whole attribution and turn it into a backlog on the next
      // render. The entry itself is tiny; the horizon is what bounds the ledger.
      const horizon = dayKeyOf(Date.now() - SPEND_HORIZON_DAYS * DAY_MS)
      for (const entry of SPEND.values()) {
        for (const key of Object.keys(entry.byDay)) {
          if (key < horizon) {
            delete entry.byDay[key]
            spendDirty = true
          }
        }
      }
      saveSpend()
      rows.sort(function (left, right) { return (right.at || 0) - (left.at || 0) })
      return rows
    }

    /**
     * Roll session rows up into all-time, today and per-day buckets.
     *
     * Per-day amounts come from what this run actually observed (see SPEND), not
     * from a single timestamp: a session's cumulative total is never dumped onto
     * one day.
     */
    function summarize(rows, now) {
      const byDay = new Map()
      const total = zeroUsage()
      const today = zeroUsage()
      const backlog = zeroUsage()
      const todayKey = dayKeyOf(now)
      let dated = 0
      let backlogSessions = 0
      for (const row of rows) {
        addInto(total, row.usage)
        if (totalTokens(row.backlog) > 0) {
          addInto(backlog, row.backlog)
          backlogSessions += 1
        }
        const keys = Object.keys(row.byDay)
        if (keys.length > 0) dated += 1
        for (const key of keys) {
          let bucket = byDay.get(key)
          if (bucket === undefined) {
            bucket = { at: parseDayKey(key), usage: zeroUsage(), sessions: [] }
            byDay.set(key, bucket)
          }
          addInto(bucket.usage, row.byDay[key])
          if (bucket.sessions.indexOf(row) < 0) bucket.sessions.push(row)
          if (key === todayKey) addInto(today, row.byDay[key])
        }
      }
      return {
        total: total,
        today: today,
        byDay: byDay,
        dated: dated,
        todayKey: todayKey,
        backlog: backlog,
        backlogSessions: backlogSessions,
      }
    }

    /** Whether an instant falls inside a half-open [from, to] day range. */
    function inRange(at, range) {
      if (range == null) return true
      if (at === null) return false
      if (range.from !== null && at < range.from) return false
      if (range.to !== null && at >= range.to + DAY_MS) return false
      return true
    }

    /** The subset of rows inside the range; a null range keeps everything. */
    function filterByRange(rows, range) {
      if (range == null) return rows
      const kept = []
      for (const row of rows) if (inRange(row.at, range)) kept.push(row)
      return kept
    }

    /**
     * The 26-week grid, in column-major order (seven rows per column), plus one
     * month label per column. Days after today render flat; days outside the
     * selected range are marked so the grid keeps its shape while the report
     * narrows.
     */
    function buildHeatmap(byDay, now, locale, range, offsetWeeks) {
      const todayStart = dayStartOf(now)
      const weekStart = todayStart - new Date(todayStart).getDay() * DAY_MS
      const first = weekStart - (HEAT_WEEKS - 1) * 7 * DAY_MS - offsetWeeks * 7 * DAY_MS
      const cells = []
      const months = []
      let peak = 0
      let lastMonth = -1
      for (let week = 0; week < HEAT_WEEKS; week += 1) {
        for (let day = 0; day < 7; day += 1) {
          const at = first + (week * 7 + day) * DAY_MS
          const key = dayKeyOf(at)
          const bucket = byDay.get(key)
          const usage = bucket === undefined ? null : bucket.usage
          const sum = usage === null ? 0 : totalTokens(usage)
          if (sum > peak) peak = sum
          cells.push({
            key: key,
            at: at,
            total: sum,
            usage: usage,
            sessions: bucket === undefined ? [] : bucket.sessions,
            future: at > todayStart,
            muted: !inRange(at, range),
          })
        }
        const columnDate = new Date(first + week * 7 * DAY_MS)
        const month = columnDate.getMonth()
        months.push(month === lastMonth ? '' : monthLabel(columnDate.getTime(), locale))
        lastMonth = month
      }
      for (const cell of cells) {
        let level = 0
        if (!cell.future && cell.total > 0 && peak > 0) {
          level = Math.ceil(cell.total / peak * 4)
          if (level < 1) level = 1
          if (level > 4) level = 4
        }
        cell.level = level
      }
      return { cells: cells, months: months, peak: peak }
    }
    //#endregion

    //#region presentational bits
    /** Self-drawn three-bar glyph; no host icon package is imported. */
    function glyph() {
      return h('svg', { className: 'tu-icon', width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true, focusable: false },
        h('rect', { x: 1, y: 7.5, width: 2.5, height: 3.5, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 4.75, y: 5, width: 2.5, height: 6, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 8.5, y: 2, width: 2.5, height: 9, rx: 1, fill: 'currentColor' }))
    }

    /** One label/value row. */
    function row(key, label, value, extraClass) {
      const className = extraClass === undefined ? 'tu-row' : 'tu-row ' + extraClass
      return h('div', { className: className, key: key },
        h('span', { className: 'tu-k' }, label),
        h('span', { className: 'tu-v tu-num' }, value))
    }

    /** Severity class for a 0..100 reading. */
    function levelOf(percent) {
      if (percent >= 90) return 'over'
      if (percent >= 75) return 'warn'
      return ''
    }


    /**
     * Context occupancy: the provider-anchored projected prompt size over the
     * newest known route capacity. Renders nothing unless both are positive -
     * a model switch can legitimately leave one of them unset.
     */
    function contextBlock(pressure, t) {
      if (pressure == null) return null
      const used = num(pressure.projectedTokens) || num(pressure.pressureTokens)
      const capacity = num(pressure.contextWindow)
      if (used <= 0 || capacity <= 0) return null
      const percent = Math.max(0, Math.min(100, used / capacity * 100))
      const level = levelOf(percent)
      return h('div', { className: 'tu-block', key: 'context' },
        row('context', t('contextUsage'), '~' + formatCount(used) + ' / ' + formatCount(capacity), 'tu-row-strong'),
        h('div', { className: 'tu-bar' },
          h('div', { className: level === '' ? 'tu-bar-fill' : 'tu-bar-fill ' + level, style: { width: percent.toFixed(1) + '%' } })),
        h('div', { className: 'tu-pct tu-num' }, percent.toFixed(1) + '%'))
    }

    /**
     * Heuristic composition of the next prompt. These are estimates from a
     * fixed density model and deliberately do NOT sum to the anchored
     * occupancy above, so every figure carries a tilde.
     */
    function breakdownBlock(breakdown, t) {
      if (breakdown == null) return null
      const items = [
        ['bdSystem', breakdown.systemTokens],
        ['bdTools', breakdown.toolsTokens],
        ['bdMessages', breakdown.messageTokens],
      ]
      let any = false
      for (const item of items) if (num(item[1]) > 0) any = true
      if (!any) return null
      return h('div', { className: 'tu-block tu-sub', key: 'breakdown' },
        items.map((item) => row(item[0], t(item[0]), '~' + formatCount(item[1]))))
    }
    //#endregion

    //#region crash guard
    /**
     * Per-entry crash guard. The host already isolates slot entries, but this
     * boundary renders NOTHING on failure instead of leaving the host's
     * data-slot-error placeholder in the composer row, the sidebar or the
     * settings page.
     */
    class MeterBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error) {
        report(error, 'render')
      }
      render() {
        return this.state.failed ? null : this.props.children
      }
    }
    //#endregion

    //#region composer reading
    /** The model a model-selection projection value names, flattened or wrapped. */
    function modelFromSelection(selection) {
      if (selection == null) return null
      const direct = selection.lastUsed
      if (direct != null && typeof direct.model === 'string' && direct.model.length > 0) return direct.model
      const wrapped = selection.values
      if (wrapped != null && wrapped.lastUsed != null && typeof wrapped.lastUsed.model === 'string') return wrapped.lastUsed.model
      return null
    }

    /**
     * The composer-row reading.
     *
     * All hooks run before any early return so the hook order never depends on
     * the data. A missing tokenUsage projection - the shape a future harness
     * release that renames the key would produce - renders nothing at all.
     */
    function DockReading(props) {
      const useProjection = typeof props.useProjection === 'function' ? props.useProjection : useNoProjection
      const usage = useProjection('tokenUsage')
      const pressure = useProjection('contextPressure')
      const breakdown = useProjection('contextBreakdown')
      const selection = useProjection('modelSelection')
      const t = typeof props.t === 'function' ? props.t : fallbackT

      const openState = React.useState(false)
      const open = openState[0]
      const setOpen = openState[1]
      const anchorState = React.useState(null)
      const anchor = anchorState[0]
      const setAnchor = anchorState[1]
      const stampState = React.useState(function () { return Date.now() })
      const refreshedAt = stampState[0]
      const setRefreshedAt = stampState[1]
      const nonceState = React.useState(0)
      const setNonce = nonceState[1]
      const rootRef = React.useRef(null)

      const place = React.useCallback(function () {
        const element = rootRef.current
        if (element == null || typeof window === 'undefined') return
        const rect = element.getBoundingClientRect()
        const viewportWidth = window.innerWidth || 0
        const viewportHeight = window.innerHeight || 0
        let left = rect.right - PANEL_WIDTH
        if (left + PANEL_WIDTH > viewportWidth - EDGE) left = viewportWidth - PANEL_WIDTH - EDGE
        if (left < EDGE) left = EDGE
        setAnchor({
          left: left,
          bottom: Math.max(EDGE, viewportHeight - rect.top + PANEL_GAP),
          maxHeight: Math.max(140, rect.top - PANEL_GAP - EDGE),
        })
      }, [])

      React.useEffect(function () {
        if (!open) return undefined
        place()
        if (typeof window === 'undefined') return undefined
        const reposition = function () { place() }
        window.addEventListener('resize', reposition)
        window.addEventListener('scroll', reposition, true)
        return function () {
          window.removeEventListener('resize', reposition)
          window.removeEventListener('scroll', reposition, true)
        }
      }, [open, place])

      React.useEffect(function () {
        if (!open) return undefined
        if (typeof document === 'undefined') return undefined
        const onKeyDown = function (event) {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          }
        }
        const onPointerDown = function (event) {
          const element = rootRef.current
          const target = event.target
          if (element != null && target != null) {
            try {
              if (element.contains(target)) return
            } catch (ignored) {
              // A non-Node target cannot be inside us; treat it as outside.
            }
          }
          setOpen(false)
        }
        document.addEventListener('keydown', onKeyDown, true)
        document.addEventListener('pointerdown', onPointerDown, true)
        return function () {
          document.removeEventListener('keydown', onKeyDown, true)
          document.removeEventListener('pointerdown', onPointerDown, true)
        }
      }, [open])

      if (usage == null) return null

      const model = modelFromSelection(selection)
      const inputText = formatCount(usage.uncachedInputTokens)
      const cacheText = formatCount(usage.cacheReadTokens)
      const outputText = formatCount(usage.outputTokens)
      const rateText = hitRateText(usage) === null ? t('noRate') : hitRateText(usage)

      const reading = t('dockReading', { input: inputText, cache: cacheText, output: outputText })
      const aria = t('triggerAria', { input: inputText, cache: cacheText, output: outputText })

      const trigger = h('button', {
        type: 'button',
        className: 'tu-trigger',
        title: aria,
        'aria-label': aria,
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        onClick: function () { setOpen(!open) },
      }, glyph(), h('span', { className: 'tu-text' }, reading))

      if (!open) return h('span', { className: 'tu-root', ref: rootRef }, trigger)

      const panelStyle = anchor === null
        ? { visibility: 'hidden', left: 0, bottom: 0 }
        : { left: anchor.left + 'px', bottom: anchor.bottom + 'px', maxHeight: anchor.maxHeight + 'px' }

      const modelText = model === null ? t('noRate') : model
      const panel = h('div', {
        className: 'tu-panel',
        role: 'dialog',
        'aria-label': t('panelTitle'),
        style: panelStyle,
      },
        h('div', { className: 'tu-title' }, t('panelTitle')),
        row('model', t('colModel'), modelText),
        row('uncachedInput', t('uncachedInput'), inputText),
        row('cacheRead', t('cacheRead'), cacheText),
        row('cacheWrite', t('cacheWrite'), formatCount(usage.cacheWriteTokens)),
        row('output', t('output'), outputText),
        h('div', { className: 'tu-block', key: 'rate' },
          row('hitRate', t('hitRate'), rateText, 'tu-row-strong')),
        contextBlock(pressure, t),
        breakdownBlock(breakdown, t),
        h('div', { className: 'tu-foot', key: 'foot' },
          h('span', { className: 'tu-stamp tu-num' }, t('refreshedAt', { time: clockText(refreshedAt) })),
          h('button', {
            type: 'button',
            className: 'tu-btn',
            onClick: function () {
              setRefreshedAt(Date.now())
              setNonce(function (value) { return value + 1 })
            },
          }, t('refresh'))))

      return h('span', { className: 'tu-root', ref: rootRef }, trigger, panel)
    }
    //#endregion

    //#region settings widgets
    /** Stable empties so useSyncExternalStore never sees a fresh object. */
    const EMPTY_LIST = { byId: {} }
    const noopSubscribe = function () { return function () {} }

    /** Browser language, used for date labels only. */
    function currentLocale() {
      try {
        const language = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language.toLowerCase() : ''
        return language.indexOf('zh') === 0 ? 'zh' : 'en'
      } catch (error) {
        return 'en'
      }
    }

    /** Start / end date inputs plus the quick presets. */
    function RangeFilter(props) {
      const t = props.t
      const range = props.range
      const fromValue = range !== null && range.from !== null ? dayKeyOf(range.from) : ''
      const toValue = range !== null && range.to !== null ? dayKeyOf(range.to) : ''
      const presets = [['all', t('rangeAll')], ['7', t('range7')], ['30', t('range30')]]
      const buttons = presets.map(function (preset) {
        return h('button', {
          key: preset[0],
          type: 'button',
          className: props.preset === preset[0] ? 'tu-preset active' : 'tu-preset',
          onClick: function () { props.onPreset(preset[0]) },
        }, preset[1])
      })
      return h('div', { className: 'tu-range' },
        h('label', null, t('rangeFrom'),
          h('input', {
            className: 'tu-input',
            type: 'date',
            value: fromValue,
            'aria-label': t('rangeFrom'),
            onChange: function (event) { props.onFrom(event.target.value) },
          })),
        h('label', null, t('rangeTo'),
          h('input', {
            className: 'tu-input',
            type: 'date',
            value: toValue,
            'aria-label': t('rangeTo'),
            onChange: function (event) { props.onTo(event.target.value) },
          })),
        h('div', { className: 'tu-range' }, buttons))
    }

    /** One summary card: caption, headline figure, detail line, optional cost. */
    function summaryCard(key, caption, usage, detail) {
      return h('div', { className: 'tu-card', key: key },
        h('div', { className: 'tu-card-k', key: 'k' }, caption),
        h('div', { className: 'tu-card-v tu-num', key: 'v' }, formatCount(totalTokens(usage))),
        h('div', { className: 'tu-card-d tu-num', key: 'd' }, detail))
    }

    /** Detail line shared by every summary card. */
    function usageDetail(usage, t) {
      return t('cardDetail', {
        input: formatCount(usage.uncachedInputTokens),
        cache: formatCount(usage.cacheReadTokens),
        output: formatCount(usage.outputTokens),
      })
    }

    /**
     * The 26-week grid with its month axis and legend.
     *
     * Every past cell is a button: selecting one opens that day's detail, which
     * is how a colour on the grid becomes the record it stands for.
     */
    function UsageHeatmap(props) {
      const t = props.t
      const heat = props.heat
      const locale = props.locale
      const selected = props.selected
      const cells = heat.cells.map(function (cell) {
        const classes = ['tu-cell']
        if (cell.level > 0) classes.push('l' + String(cell.level))
        if (cell.muted) classes.push('muted')
        if (selected === cell.key) classes.push('sel')
        const title = cell.future
          ? ''
          : t('heatCell', { date: dayLabel(cell.at, locale), total: formatCount(cell.total) })
        return h('button', {
          key: cell.key,
          type: 'button',
          className: classes.join(' '),
          title: title,
          'aria-label': title,
          'aria-pressed': selected === cell.key,
          disabled: cell.future,
          onClick: cell.future ? undefined : function () { props.onSelect(cell.key) },
        })
      })
      const months = heat.months.map(function (label, index) {
        return h('div', { className: 'tu-heat-month', key: String(index) }, label)
      })
      return h('div', { className: 'tu-heat' },
        h('div', { className: 'tu-heat-grid' }, cells),
        h('div', { className: 'tu-heat-months' }, months),
        h('div', { className: 'tu-legend' },
          h('span', null, t('heatLess')),
          h('span', { className: 'tu-cell', disabled: true }),
          h('span', { className: 'tu-cell l1', disabled: true }),
          h('span', { className: 'tu-cell l2', disabled: true }),
          h('span', { className: 'tu-cell l3', disabled: true }),
          h('span', { className: 'tu-cell l4', disabled: true }),
          h('span', null, t('heatMore'))))
    }
    //#endregion

    /**
     * The slider that slides the 26-week window through history.
     *
     * The grid keeps filling the pane width, so the control - not a scrollbar -
     * is what moves time: the window ends `offset` weeks earlier than today.
     */
    function WindowSlider(props) {
      const t = props.t
      const cells = props.heat.cells
      const first = cells.length > 0 ? cells[0] : null
      const last = cells.length > 0 ? cells[cells.length - 1] : null
      const from = first === null ? '' : dayLabel(first.at, props.locale)
      const to = last === null ? '' : dayLabel(last.at, props.locale)
      return h('div', { className: 'tu-heat' },
        h('input', {
          className: 'tu-slider',
          type: 'range',
          min: 0,
          max: 52,
          step: 1,
          value: props.offset,
          'aria-label': t('windowLabel'),
          onChange: function (event) { props.onOffset(Number(event.target.value) || 0) },
        }),
        h('div', { className: 'tu-window tu-num' },
          t('windowRange', { from: from, to: to }),
          props.offset === 0 ? null : ' · ' + t('windowWeeks', { weeks: props.offset })))
    }

    /** The sessions of one selected day, as the heatmap's drill-down. */
    function DayDetail(props) {
      const t = props.t
      const cell = props.cell
      if (cell == null) return null
      return h('div', { className: 'tu-day' },
        h('div', { className: 'tu-day-head' },
          h('span', null, fullDayLabel(cell.at, props.locale)),
          h('span', { className: 'tu-num' }, formatCount(cell.total) + ' tokens')),
        cell.sessions.length === 0
          ? h('p', { className: 'tu-empty' }, t('dayNone'))
          : SessionTable({ t: t, rows: cell.sessions, limit: 50, selected: null, onSelect: null }))
    }

    /** Per-session table with model and cost. */
    function SessionTable(props) {
      const t = props.t
      const limit = props.limit === undefined ? 20 : props.limit
      const rows = props.rows.slice(0, limit)
      const head = h('thead', null, h('tr', null,
        h('th', null, t('colSession')),
        h('th', null, t('colDay')),
        h('th', null, t('colModel')),
        h('th', { className: 'num' }, t('colInput')),
        h('th', { className: 'num' }, t('colCache')),
        h('th', { className: 'num' }, t('colOutput')),
        h('th', { className: 'num' }, t('colTotal'))))
      const body = h('tbody', null, rows.map(function (item) {
        const name = item.title.length > 0 ? item.title : item.id
        const model = item.model === null ? t('noRate') : item.model
        const selected = props.selected === item.id
        // The day column names the session's last prompt day - the day its
        // tokens are attributed to until this run observes growth.
        const dayText = item.day === null ? t('noRate') : dayLabel(dayStartOf(item.at), props.locale)
        const dayTitle = item.day === null ? dayText : fullDayLabel(item.at, props.locale)
        return h('tr', {
          key: item.id,
          className: selected ? 'sel' : undefined,
          onClick: props.onSelect == null ? undefined : function () { props.onSelect(item.id) },
        },
          h('td', { className: 'name', title: name }, name),
          h('td', { className: 'day', title: dayTitle }, dayText),
          h('td', { title: model }, model),
          h('td', { className: 'num' }, formatCount(item.usage.uncachedInputTokens)),
          h('td', { className: 'num' }, formatCount(item.usage.cacheReadTokens)),
          h('td', { className: 'num' }, formatCount(item.usage.outputTokens)),
          h('td', { className: 'num' }, formatCount(item.total)))
      }))
      return h('table', { className: 'tu-table' }, head, body)
    }

    /** The date range a preset stands for; "all" is the absence of a range. */
    function rangeForPreset(preset, now) {
      if (preset !== '7' && preset !== '30') return null
      const days = preset === '7' ? 7 : 30
      const to = dayStartOf(now)
      return { from: to - (days - 1) * DAY_MS, to: to }
    }

    /**
     * The Settings page.
     *
     * Cross-session figures come from the client session list, which the host
     * already fills with each session's tokenUsage and modelSelection
     * projections. Nothing here reaches the host: when the list is unavailable
     * the page degrades to a single explanatory line instead of failing.
     */
    function UsageSection(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const sessions = props.sessions
      const locale = currentLocale()

      const subscribe = React.useCallback(function (listener) {
        if (sessions == null || sessions.list == null || typeof sessions.list.subscribe !== 'function') return noopSubscribe()
        let stop
        try {
          stop = sessions.list.subscribe(listener)
        } catch (error) {
          report(error, 'session list subscribe')
          return noopSubscribe()
        }
        // React calls this on cleanup, so a host that returns anything else
        // must not turn a subscription into a render crash.
        return typeof stop === 'function' ? stop : noopSubscribe()
      }, [sessions])
      const getSnapshot = React.useCallback(function () {
        if (sessions == null || sessions.list == null || typeof sessions.list.getSnapshot !== 'function') return EMPTY_LIST
        return sessions.list.getSnapshot()
      }, [sessions])
      const list = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

      const presetState = React.useState('all')
      const preset = presetState[0]
      const setPreset = presetState[1]
      const rangeState = React.useState(null)
      const range = rangeState[0]
      const setRange = rangeState[1]
      const dayState = React.useState(null)
      const selectedDay = dayState[0]
      const setSelectedDay = dayState[1]
      const offsetState = React.useState(0)
      const offset = offsetState[0]
      const setOffset = offsetState[1]

      const rows = React.useMemo(function () { return collectSessions(list) }, [list])
      const visible = React.useMemo(function () { return filterByRange(rows, range) }, [rows, range])
      const allSummary = React.useMemo(function () { return summarize(rows, Date.now()) }, [rows])
      const summary = React.useMemo(function () { return summarize(visible, Date.now()) }, [visible])
      const heat = React.useMemo(function () { return buildHeatmap(allSummary.byDay, Date.now(), locale, range, offset) }, [allSummary, locale, range, offset])

      const applyPreset = function (next) {
        setPreset(next)
        setRange(rangeForPreset(next, Date.now()))
        setSelectedDay(null)
      }
      const applyFrom = function (value) {
        setPreset('custom')
        setRange({ from: parseDayKey(value), to: range === null ? null : range.to })
      }
      const applyTo = function (value) {
        setPreset('custom')
        setRange({ from: range === null ? null : range.from, to: parseDayKey(value) })
      }

      if (sessions == null) {
        return h('div', { className: 'tu-section' },
          h('h3', { className: 'tu-h' }, t('title')),
          h('p', { className: 'tu-empty' }, t('unavailable')))
      }

      const current = rows.length > 0 ? rows[0] : null
      const currentUsage = current === null ? zeroUsage() : current.usage

      const cards = h('div', { className: 'tu-cards' },
        summaryCard('session', t('cardSession'), currentUsage, usageDetail(currentUsage, t)),
        summaryCard('today', t('cardToday'), allSummary.today, usageDetail(allSummary.today, t)),
        summaryCard('total', t('cardTotal'), allSummary.total, usageDetail(allSummary.total, t)))

      const rangeHint = t('rangeSummary', {
        sessions: visible.length,
        tokens: formatCount(totalTokens(summary.total)),
      })

      const heatChildren = [
        h('h3', { className: 'tu-h' }, t('heatTitle')),
        h('p', { className: 'tu-hint tu-num' }, t('heatTotal', {
          total: formatCount(totalTokens(allSummary.total)),
          input: formatCount(allSummary.total.uncachedInputTokens),
          cache: formatCount(allSummary.total.cacheReadTokens),
          output: formatCount(allSummary.total.outputTokens),
        })),
      ]
      if (allSummary.backlogSessions > 0) {
        heatChildren.push(h('p', { className: 'tu-hint tu-num' }, t('carry', {
          tokens: formatCount(totalTokens(allSummary.backlog)),
          sessions: allSummary.backlogSessions,
        })))
      }
      if (allSummary.dated > 0) heatChildren.push(UsageHeatmap({ t: t, heat: heat, locale: locale, selected: selectedDay, onSelect: setSelectedDay }))
      if (allSummary.dated > 0) heatChildren.push(WindowSlider({ t: t, heat: heat, locale: locale, offset: offset, onOffset: setOffset }))
      heatChildren.push(DayDetail({ t: t, locale: locale, cell: heat.cells.find(function (cell) { return cell.key === selectedDay }) }))
      const heatBlock = h('div', { className: 'tu-group' }, heatChildren)

      const tableBlock = h('div', { className: 'tu-group' },
        h('h3', { className: 'tu-h' }, t('tableTitle')),
        h('p', { className: 'tu-hint' }, rangeHint),
        visible.length > 0
          ? SessionTable({ t: t, locale: locale, rows: visible, selected: null, onSelect: null })
          : h('p', { className: 'tu-empty' }, t('noSessions')))

      return h('div', { className: 'tu-section' },
        h('h3', { className: 'tu-h' }, t('title')),
        RangeFilter({ t: t, range: range, preset: preset, onPreset: applyPreset, onFrom: applyFrom, onTo: applyTo }),
        cards,
        heatBlock,
        tableBlock)
    }
    //#endregion

    //#region sidebar card
    /**
     * Bars for the last fortnight, drawn inline so no icon package is needed.
     * Empty days keep a flat stub so the rhythm of the fortnight stays visible.
     */
    function sparkline(cells, onSelect, selected, t, locale) {
      const elapsed = []
      for (const cell of cells) if (!cell.future) elapsed.push(cell)
      const recent = elapsed.slice(-14)
      let peak = 0
      for (const cell of recent) if (cell.total > peak) peak = cell.total
      const width = 140
      const height = 30
      const slot = width / Math.max(1, recent.length)
      const barWidth = Math.max(3, slot - 2)
      // The tallest bar stops short of the top so the picked one always has
      // room to grow: selection is expressed by size, not by a ring.
      const maxBar = height - 4
      const bars = recent.map(function (cell, index) {
        const ratio = peak <= 0 ? 0 : cell.total / peak
        const base = cell.total <= 0 ? 2 : Math.max(3, Math.round(ratio * maxBar))
        const isSelected = selected === cell.key
        const barHeight = Math.min(height, base + (isSelected ? 4 : 0))
        const thisWidth = Math.min(slot - 1, barWidth + (isSelected ? 3 : 0))
        const classes = ['tu-spark-bar']
        if (cell.total <= 0) classes.push('empty')
        if (isSelected) classes.push('sel')
        const label = t('heatCell', { date: dayLabel(cell.at, locale), total: formatCount(cell.total) })
        const toggle = function () { onSelect(isSelected ? null : cell.key) }
        return h('rect', {
          key: cell.key,
          className: classes.join(' '),
          x: (index * slot + (slot - thisWidth) / 2).toFixed(2),
          y: (height - barHeight).toFixed(2),
          width: thisWidth.toFixed(2),
          height: String(barHeight),
          rx: '1.5',
          role: 'button',
          tabIndex: 0,
          'aria-label': label,
          'aria-pressed': selected === cell.key,
          onClick: toggle,
          onKeyDown: function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle()
            }
          },
        })
      })
      return h('svg', {
        className: 'tu-spark',
        viewBox: '0 0 ' + String(width) + ' ' + String(height),
        preserveAspectRatio: 'none',
        role: 'group',
        'aria-label': t('sparkAria'),
      }, bars)
    }

    /**
     * Sidebar footer card: today and all-time totals with their estimated cost.
     *
     * Root-scoped, so it has no session of its own and reads the session list
     * instead. Renders nothing while the list is unavailable or empty rather
     * than occupying the footer with zeros.
     */
    function SidebarCard(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const sessions = props.sessions
      const wide = props.wide !== false

      const subscribe = React.useCallback(function (listener) {
        if (sessions == null || sessions.list == null || typeof sessions.list.subscribe !== 'function') return noopSubscribe()
        let stop
        try {
          stop = sessions.list.subscribe(listener)
        } catch (error) {
          report(error, 'session list subscribe')
          return noopSubscribe()
        }
        // React calls this on cleanup, so a host that returns anything else
        // must not turn a subscription into a render crash.
        return typeof stop === 'function' ? stop : noopSubscribe()
      }, [sessions])
      const getSnapshot = React.useCallback(function () {
        if (sessions == null || sessions.list == null || typeof sessions.list.getSnapshot !== 'function') return EMPTY_LIST
        return sessions.list.getSnapshot()
      }, [sessions])
      const list = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      const rows = React.useMemo(function () { return collectSessions(list) }, [list])
      const summary = React.useMemo(function () { return summarize(rows, Date.now()) }, [rows])
      const sparkState = React.useState(null)
      const selected = sparkState[0]
      const setSelected = sparkState[1]

      if (sessions == null || rows.length === 0) return null

      const total = totalTokens(summary.total)
      const today = totalTokens(summary.today)
      if (!wide) {
        return h('div', { className: 'tu-side tu-side-rail', title: t('title') },
          h('div', { className: 'tu-side-line tu-num' }, formatCount(total)))
      }
      const heat = buildHeatmap(summary.byDay, Date.now(), currentLocale(), null, 0)
      const picked = selected === null ? null : heat.cells.find(function (cell) { return cell.key === selected })
      const pickLine = picked === null || picked === undefined
        ? null
        : h('div', { className: 'tu-side-line tu-side-pick' },
            h('span', null, fullDayLabel(picked.at, currentLocale())),
            h('b', { className: 'tu-num' }, formatCount(picked.total)))
      return h('div', { className: 'tu-side' },
        h('div', { className: 'tu-side-head' },
          h('span', { className: 'tu-side-brand' }, glyph(), t('title')),
          h('span', { className: 'tu-side-total tu-num' }, formatCount(total))),
        sparkline(heat.cells, setSelected, selected, t, currentLocale()),
        pickLine,
        h('div', { className: 'tu-side-line' },
          h('span', null, t('cardToday')),
          h('b', { className: 'tu-num' }, formatCount(today))),
        h('div', { className: 'tu-side-line' },
          h('span', null, t('cardTotal')),
          h('b', { className: 'tu-num' }, formatCount(total))))
    }
    //#endregion

    //#region entries
    /** Registered composer component: the boundary owns the reading. */
    function DockEntry(props) {
      return h(MeterBoundary, null, h(DockReading, props))
    }

    /** Registered sidebar component: the boundary owns the card. */
    function SidebarEntry(props) {
      return h(MeterBoundary, null, h(SidebarCard, props))
    }

    /** Registered settings component: the boundary owns the page. */
    function SectionEntry(props) {
      return h(MeterBoundary, null, h(UsageSection, props))
    }

    /**
     * Self-drawn settings-nav glyph: three ascending bars, the same reading the
     * composer icon uses. The host picks a generic gear for any section id it
     * does not know, so the label supplies its own mark.
     */
    function navGlyph() {
      return h('svg', { className: 'tu-nav-icon', width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false },
        h('rect', { x: 2, y: 10, width: 3, height: 4, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 6.5, y: 6.5, width: 3, height: 7.5, rx: 1, fill: 'currentColor' }),
        h('rect', { x: 11, y: 3, width: 3, height: 11, rx: 1, fill: 'currentColor' }))
    }

    /** The host's active locale, or null when it cannot be read. */
    function readHostLocale(localeService) {
      try {
        if (localeService == null || typeof localeService.getSnapshot !== 'function') return null
        const snapshot = localeService.getSnapshot()
        const active = snapshot != null && typeof snapshot.active === 'string' ? snapshot.active.toLowerCase() : ''
        if (active.indexOf('zh') === 0) return 'zh'
        if (active.indexOf('en') === 0) return 'en'
      } catch (error) {
        return null
      }
      return null
    }
    //#endregion

    //#region plugin
    /**
     * Client plugin body. Every step is individually guarded: a plugin that
     * fails to register must cost nothing but its own absence.
     */
    function apply(ctx) {
      if (ctx == null) return


      try {
        injectCss()
        if (typeof ctx.effect === 'function') ctx.effect(function () { return removeCss }, 'token-usage: stylesheet')
      } catch (error) {
        report(error, 'stylesheet')
      }

      let localeService
      let localeReady = false
      try {
        localeService = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
        if (localeService != null && typeof localeService.register === 'function' && typeof ctx.effect === 'function') {
          ctx.effect(function () { return localeService.register(NS, MESSAGES) }, 'token-usage: dictionaries')
          localeReady = true
        }
      } catch (error) {
        localeReady = false
        report(error, 'locale')
      }

      let sessionsService
      let slots
      try {
        sessionsService = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
        slots = typeof ctx.get === 'function' ? ctx.get('slots') : undefined
      } catch (error) {
        report(error, 'service lookup')
        return
      }
      if (slots == null || typeof slots.inject !== 'function') return

      // Declaring a namespace without an installed locale face throws during
      // assembly, so the seat is only claimed when the face exists.
      const localeOption = localeReady ? NS : undefined

      /** Register one seat; the slot key may simply never be declared. */
      const seat = function (slotKey, order, extra, sessionsFor, component) {
        try {
          return slots.inject(slotKey, function () {
            if (typeof slots.register !== 'function') return undefined
            const options = { name: slotKey, id: ENTRY_ID, order: order, locale: localeOption, inject: function () { return { sessions: sessionsFor } } }
            if (extra != null) for (const key of Object.keys(extra)) options[key] = extra[key]
            try {
              return slots.register(options, component)
            } catch (error) {
              report(error, slotKey + ' register')
              return undefined
            }
          })
        } catch (error) {
          report(error, slotKey + ' inject')
          return undefined
        }
      }

      // The composer reading needs only the slot registry, so it registers now.
      seat(DOCK_SLOT, DOCK_ORDER, null, undefined, DockEntry)
      //
      // The sidebar card and the settings page additionally need the client
      // session list, which the renderer ALSO provides after this plugin
      // applies. Cordis re-runs this callback once the service exists and owns
      // the disposers it returns, so those two seats appear at boot without
      // holding the composer reading hostage to a service it never uses.
      //
      const registerCrossSession = function (sessionCtx) {
        const sessionsFor = sessionCtx != null && sessionCtx.sessions != null
          ? sessionCtx.sessions
          : typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
        const disposers = [
          seat(SIDEBAR_SLOT, SIDEBAR_ORDER, null, sessionsFor, SidebarEntry),
          seat(SECTION_SLOT, SECTION_ORDER, {
        // The settings nav draws a generic gear for every section id it does not
        // know, so the label carries its own glyph and the stylesheet hides the
        // host icon in the cell that contains it. resolveSlotLabel returns the
        // value unchanged, so returning an element here is legal.
        label: function () {
          const text = (readHostLocale(localeService) || currentLocale()) === 'zh' ? MESSAGES.zh.navLabel : MESSAGES.en.navLabel
          try {
            return h('span', { className: 'tu-nav' }, navGlyph(), h('span', null, text))
          } catch (error) {
            // The host calls this while building its own settings tree, so a
            // failure here must degrade to plain text, never propagate.
            report(error, 'nav label')
            return text
          }
          },
          }, sessionsFor, SectionEntry),
        ]
        return function () {
          for (const dispose of disposers) if (typeof dispose === 'function') dispose()
        }
      }
      if (typeof ctx.inject === 'function') ctx.inject(['sessions'], registerCrossSession)
      else registerCrossSession(null)
    }

    exports.apply = apply
    /**
     * Wait for the slot registry before applying.
     *
     * Declaring nothing made the client Loader run apply() immediately at boot,
     * which is BEFORE the renderer provides `slots`; the guard in apply() then
     * saw no service and returned, so nothing was ever registered. Declaring the
     * dependency makes Cordis hold the plugin until the service exists - and
     * re-apply it if the service is ever replaced.
     */
    exports.inject = ['slots']
    /** Exposed for the dictionary-parity gate; not a public API. */
    exports.__messages = MESSAGES
    return module.exports
  },
})
