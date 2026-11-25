/**
 * dsh-token-usage - browser half.
 *
 * A read-only token usage view for DeepSeek Harness, in three seats:
 *
 *   - the composer row (conversation.composer.dock): a live one-line reading
 *     that expands into a per-bucket detail panel;
 *   - the sidebar footer (sidebar.footer.action): today / all-time totals;
 *   - the main-column panel + its sidebar entry (main + sidebar.panellist):
 *     a date-ranged usage report with summary
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
    /** The main-panel key AND its sidebar entry id: the sidebar routes id → key. */
    const PANEL_KEY = 'token-usage'
    /** Panel-list position: after Plugins (0) and Automation tasks, beside them. */
    const PANEL_ORDER = 40
    const DOCK_SLOT = 'conversation.composer.dock'
    const SIDEBAR_SLOT = 'sidebar.footer.action'
    const ENTRY_ID = 'token-usage'
    const DOCK_ORDER = 40
    const SIDEBAR_ORDER = 12
    const CSS_TAG_ID = 'dsh-token-usage/client.css'
    const PANEL_WIDTH = 264
    const PANEL_GAP = 8
    const EDGE = 8
    const DAY_MS = 86400000
    /**
     * The heatmap window, in weeks.
     *
     * MAX is the ceiling: past it the grid pages instead of growing wider.
     * MIN keeps a young history from rendering a two-cell sliver - below it the
     * grid is padded on the left with empty weeks, so the shape stays readable
     * while the data fills in. The window itself is the ACTUAL span between the
     * first recorded week and the latest one, clamped to these bounds: a
     * hard-coded 26-week window over 9 weeks of history spent 69% of the grid
     * on empty cells and offered a slider with nowhere to drag.
     */
    /**
     * Weeks in one window.
     *
     * The grid always renders a FULL window - 53 weeks, one year plus the
     * partial week - left-aligned at a fixed cell size, so the number of
     * columns never depends on how much history exists. A young history simply
     * leaves the leftmost weeks empty while the calendar keeps its shape; the
     * alternative (shrink the frame to the data) produced a handful of giant
     * squares that dominated the page.
     *
     * 53 rather than 52 because a calendar year can straddle 53 week columns.
     */
    const HEAT_WEEKS = 53


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
      '.tu-windowbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-window{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-windownav{display:inline-flex;align-items:center;gap:4px}',
      '.tu-winbtn{font:inherit;font-size:12px;line-height:16px;margin:0;padding:1px 7px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-secondary,#61666b);cursor:pointer}',
      '.tu-winbtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-winbtn:disabled{opacity:.35;cursor:default}',
      '.tu-winbtn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      // ---- share bars (grouped usage detail) ----
      '.tu-share{display:flex;align-items:center;gap:6px;min-width:0}',
      '.tu-share-track{flex:1 1 60px;min-width:40px;height:5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));overflow:hidden}',
      '.tu-share-fill{height:100%;border-radius:999px;background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.85}',
      '.tu-share-fill.warn{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.tu-share-pct{flex:none;min-width:34px;text-align:right;color:var(--dsw-alias-label-tertiary,#81858c);font-size:11px;font-variant-numeric:tabular-nums}',
      '.tu-groupname{font-weight:600}',
      // ---- relative baseline ----
      '.tu-base{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:2px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-base b{font-variant-numeric:tabular-nums}',
      '.tu-base b{font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-base .up{color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.tu-base .down{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
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
      '.tu-side-base,.tu-side-base span{font-size:11px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-side-line b.up{color:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.tu-side-line b.down{color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-side-rail{align-items:center;gap:2px;padding:6px}',
      '.tu-side-rail .tu-side-line{justify-content:center}',
      // ---- settings section ----
      '.tu-section{display:flex;flex-direction:column;gap:20px;padding:4px 2px 24px;font-size:13px;color:var(--dsw-alias-label-primary,#0f1115)}',
      // ---- full-page panel (main slot) ----
      '.tu-page{display:flex;flex-direction:column;gap:20px;box-sizing:border-box;width:100%;max-width:1080px;margin:0 auto;padding:24px 28px 40px;font-size:13px;color:var(--dsw-alias-label-primary,#0f1115);overflow:auto}',
      '.tu-page-h{margin:0;font-size:20px;line-height:28px;font-weight:600;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-page-sub{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-panellist-icon{display:block}',
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
      '.tu-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
      '.tu-card{display:flex;flex-direction:column;gap:8px;min-width:0;box-sizing:border-box;padding:16px 18px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff);transition:box-shadow 120ms ease-out,border-color 120ms ease-out}',
      '.tu-card:hover{box-shadow:var(--dsw-elevation-panel,0 3px 8px rgba(0,0,0,.06))}',
      // Type scale is deliberately narrow: 26 / 13 / 12 / 10. A metric page
      // reads better with two strong weights than with many small variations.
      '.tu-card-k{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-card-v{font-size:26px;line-height:34px;font-weight:600;letter-spacing:-.01em;color:var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-card-d{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#81858c);overflow-wrap:anywhere}',
      // ---- heatmap (contribution-graph treatment) ----
      // The grid is a FIXED cell size, left-aligned: cells never stretch to fill
      // the pane, so a wide page shows a compact calendar instead of giant
      // squares that dominate the view.
      '.tu-heat{display:flex;flex-direction:column;gap:6px;min-width:0}',
      // No vertical clipping: the hover scale would otherwise be cut off at the
      // top row (it looked like a stray line above the calendar). Vertical
      // padding gives the grow room to overflow into.
      '.tu-heat-scroll{overflow-x:auto;overflow-y:visible;padding:3px 0 2px}',
      // Cells are a FIXED size and the grid is exactly as wide as its columns.
      //
      // Stretching the columns (`1fr`) is what made a nine-week history render
      // as nine enormous squares: with few columns each one absorbed a twelfth
      // of the page. A fixed tile keeps every cell the same size no matter how
      // The cell edge comes from the render as a pixel value (`--tu-cell-w`):
      // the render solves it from the measured pane against the FULL year of
      // columns, so the grid spans the pane at a constant, readable tile size.
      // Never `1fr` - stretching turned a short history into giant squares.
      '.tu-heat-grid{display:grid;grid-auto-flow:column;grid-auto-columns:var(--tu-cell-w,18px);grid-template-rows:repeat(7,var(--tu-cell-h,18px));gap:var(--tu-gap,3px);width:max-content;margin:0}',
      '.tu-cell{width:var(--tu-cell-w,18px);height:var(--tu-cell-h,18px);padding:0;border:0;border-radius:3px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));cursor:pointer;transition:transform 80ms ease-out}',
      '.tu-cell:disabled{cursor:default}',
      // Intensity is expressed with opacity on a solid brand fill, not with
      // color-mix(): the steps carry information, so they must not depend
      // on a colour function a host engine might not support.
      '.tu-cell.l1{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.22}',
      '.tu-cell.l2{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.44}',
      '.tu-cell.l3{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.68}',
      '.tu-cell.l4{background:var(--dsw-alias-state-business-primary,#4d6bfe);opacity:.9}',
      '.tu-cell.l5{background:var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-cell:not(:disabled):hover{transform:scale(1.16);position:relative;z-index:1}',
      '.tu-cell.muted{filter:opacity(.38)}',
      // Future weeks are drawn so the year keeps its shape, but they must not
      // read as "a day with no usage": they are dimmer and never interactive.
      '.tu-cell.future{background:var(--dsw-alias-border-l1,rgba(0,0,0,.06));opacity:.5}',
      // Today keeps a ring so "now" is findable without reading labels.
      '.tu-cell.today{box-shadow:0 0 0 1px var(--dsw-alias-state-business-primary,#4d6bfe)}',
      '.tu-cell.sel{box-shadow:0 0 0 2px var(--dsw-alias-label-primary,#0f1115)}',
      '.tu-cell:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.tu-heat-months{display:grid;grid-auto-flow:column;grid-auto-columns:var(--tu-cell-w,18px);gap:var(--tu-gap,3px);width:max-content;padding-top:3px;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-heat-month{overflow:visible;white-space:nowrap}',
      '.tu-legend{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dsw-alias-label-tertiary,#81858c)}',
      '.tu-legend .tu-cell{width:11px;height:11px;flex:none;cursor:default;border-radius:3px}',
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
      '.tu-table th.act,.tu-table td.act{width:74px;text-align:right}',
      '.tu-del{font:inherit;font-size:11px;line-height:18px;margin:0;padding:2px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06));border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-state-error-primary,#ec1313);cursor:pointer}',
      '.tu-del:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
      '.tu-del:disabled{opacity:.5;cursor:default}',
      '.tu-del:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe)}',
      '.tu-del-notice{margin:0 0 6px}',
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
        panelLabel: 'Token 用量',
        pageTitle: 'Token 用量',
        pageSubtitle: '跨会话的 token 用量：按天、按模型、按会话。数据全部来自宿主已发布的统计，不做费用换算。',
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
        windowAll: '· 共 {weeks} 周，全部显示',
        windowPage: '第 {page} / {pages} 页',
        windowFirst: '回到最早',
        windowPrev: '上一页',
        windowNext: '下一页',
        windowLatest: '回到最新',
        sparkAria: '近 14 天用量,点柱子查看当天',
        cardToday: '今日',
        cardTotal: '累计',
        cardRange: '区间合计',
        cardDetail: '输入 {input} · 缓存 {cache} · 输出 {output}',
        cardSessions: '{count} 个会话',
        heatTitle: 'Token 用量统计',
        heatTotal: '累计 {total} tokens · 输入 {input} · 缓存 {cache} · 输出 {output}',
        carry: '另有 {tokens} tokens（{sessions} 个会话）是插件开始观察之前就花掉的，而且这些会话最后提问就在今天 —— 无法区分其中多少属于今天，所以不放进日历。',
        heatLess: '少',
        heatMore: '多',
        heatCell: '{date} · {total} tokens',
        heatFuture: '{date} · 尚未到来',
        dayTitle: '当日明细',
        dayNone: '这天没有记录',
        tableTitle: '用量明细',
        groupByModel: '按模型',
        groupBySession: '按会话',
        shareOfTotal: '占比',
        expandAll: '展开全部 {count} 项',
        collapse: '收起',
        vsDailyAvg: 'vs 日均 {value}',
        vsLastWeek: '上周同期 {value}',
        above: '高于',
        below: '低于',
        colSession: '会话',
        colDay: '日期',
        colModel: '模型',
        colInput: '输入 tok',
        colCache: '缓存 tok',
        colOutput: '输出 tok',
        colTotal: '合计 tok',
        colActions: '操作',
        deleteSession: '删除',
        deleteSessionMenu: '删除会话',
        deleteSessionHint: '删除此对话及其 token 记录和会话文件',
        deleteConfirm: '确定删除“{title}”？该对话的 token 记录和会话文件会一并删除，且不可恢复。',
        deleteDone: '对话已删除',
        deleteFailed: '删除失败：{message}',
        noSessions: '还没有会话记录',
        unavailable: '此版本未提供会话列表,仅显示本会话读数',
      },
      en: {
        navLabel: 'Token usage',
        panelLabel: 'Token usage',
        pageTitle: 'Token usage',
        pageSubtitle: 'Cross-session token usage by day, model and session. Every figure comes from data the harness already publishes; no cost conversion.',
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
        windowAll: '· {weeks} weeks, all shown',
        windowPage: 'Page {page} of {pages}',
        windowFirst: 'Jump to earliest',
        windowPrev: 'Previous page',
        windowNext: 'Next page',
        windowLatest: 'Jump to latest',
        sparkAria: 'Last 14 days; click a bar for that day',
        cardToday: 'Today',
        cardTotal: 'All time',
        cardRange: 'In range',
        cardDetail: 'In {input} · Cache {cache} · Out {output}',
        cardSessions: '{count} sessions',
        heatTitle: 'Token usage',
        heatTotal: '{total} tokens total · In {input} · Cache {cache} · Out {output}',
        carry: 'A further {tokens} tokens ({sessions} sessions) were spent before this plugin started observing, and those sessions were last prompted today. How much of that is today cannot be told, so it stays out of the calendar.',
        heatLess: 'Less',
        heatMore: 'More',
        heatCell: '{date} · {total} tokens',
        heatFuture: '{date} · not yet',
        dayTitle: 'Day detail',
        dayNone: 'Nothing recorded on this day',
        tableTitle: 'Usage detail',
        groupByModel: 'By model',
        groupBySession: 'By session',
        shareOfTotal: 'Share',
        expandAll: 'Show all {count}',
        collapse: 'Collapse',
        vsDailyAvg: 'vs {value} daily avg',
        vsLastWeek: 'last week {value}',
        above: 'above',
        below: 'below',
        colSession: 'Session',
        colDay: 'Day',
        colModel: 'Model',
        colInput: 'Input tok',
        colCache: 'Cache tok',
        colOutput: 'Output tok',
        colTotal: 'Total tok',
        colActions: 'Actions',
        deleteSession: 'Delete',
        deleteSessionMenu: 'Delete session',
        deleteSessionHint: 'Delete this conversation, its token record, and its session files',
        deleteConfirm: 'Delete “{title}”? This removes the conversation, its token record, and its session files. This cannot be undone.',
        deleteDone: 'Conversation deleted',
        deleteFailed: 'Delete failed: {message}',
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
    const SPEND_KEY = 'dsh-token-usage.spend.v3'

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
        if (parsed == null || typeof parsed !== 'object' || parsed.v !== 3) return store
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
        localStorage.setItem(SPEND_KEY, JSON.stringify({ v: 3, s: sessions }))
      } catch (error) {
        // A full or unavailable store must not break the readout.
        report(error, 'save observed spending')
      }
    }

    /** Drop one session's observed-spending entry; deleting the conversation discards its token record too. */
    function forgetSpend(id) {
      if (!SPEND.delete(id)) return
      spendDirty = true
      saveSpend()
    }

    /**
     * Delete one conversation through the host's authenticated route.
     *
     * The host removes the stored session directory (which is where every token
     * figure this plugin shows comes from), detaches it from the Workspace
     * registry, and tells the client list to drop the row. This function also
     * discards the local storage ledger entry for that session.
     */
    function deleteSessionOnHost(ctx, sessions, sessionId) {
      return Promise.resolve().then(function () {
        if (typeof fetch !== 'function') throw new Error('fetch unavailable')
        return fetch('api/token-usage/delete-session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId }),
        })
      }).then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            let message = text
            try {
              const parsed = JSON.parse(text)
              if (parsed !== null && typeof parsed === 'object' && typeof parsed.error === 'string') message = parsed.error
            } catch (error) {
              // Plain-text failures stay as they arrived.
            }
            throw new Error(message || ('HTTP ' + response.status))
          })
        }
        return response.json().catch(function () { return {} })
      }).then(function (result) {
        forgetSpend(sessionId)
        if (sessions !== null && sessions !== undefined && typeof sessions.refresh === 'function') {
          return Promise.resolve(sessions.refresh()).catch(function (error) {
            report(error, 'refresh after delete')
          }).then(function () { return result })
        }
        return result
      })
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
        seen = { usage: cloneUsage(usage), byDay: {}, backlog: zeroUsage() }
        SPEND.set(id, seen)
        // Usage that already existed at first sight is placed on the session's
        // last prompt day, so the calendar keeps its history - but never on
        // today. How much of a session's total was spent today cannot be told
        // from the carried-over history (the list row does not even carry the
        // session's creation time), and today is precisely the figure that must
        // not be inflated. What cannot be placed is reported as a backlog.
        const day = at === null ? null : dayKeyOf(at)
        if (day !== null && day !== dayKeyOf(Date.now()) && total > 0) seen.byDay[day] = cloneUsage(usage)
        else seen.backlog = cloneUsage(usage)
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
     * The exact per-day buckets the host publishes for a session, or null.
     *
     * The host folds the session event log - where every settled assistant
     * message carries its own usage and wall-clock time - into one bucket set
     * per day, so this is the real split rather than an inference. It is absent
     * for a session the host has never loaded, and absent entirely on a harness
     * without the seam; both cases fall back to the observed-spend ledger.
     */
    function sessionByDay(summary) {
      const values = summary.projectionValues
      if (values == null) return null
      const raw = values.tokenUsageByDay
      if (raw == null || typeof raw !== 'object') return null
      const days = raw.values == null ? raw : raw.values
      if (days == null || typeof days !== 'object') return null
      const out = {}
      let any = false
      for (const key of Object.keys(days)) {
        const bucket = days[key]
        if (bucket == null || typeof bucket !== 'object') continue
        out[key] = {
          uncachedInputTokens: num(bucket.uncachedInputTokens),
          outputTokens: num(bucket.outputTokens),
          cacheReadTokens: num(bucket.cacheReadTokens),
          cacheWriteTokens: num(bucket.cacheWriteTokens),
        }
        any = true
      }
      return any ? out : null
    }

    /** A stable empty id list, so the archived snapshot never churns identity. */
    const NO_IDS = Object.freeze([])

    /** A stable empty id set. */
    const NO_ARCHIVED = new Set()

    let workspacesService

    /**
     * The workspace service, resolved on first use.
     *
     * It is provided during client boot, and apply() may run before that, so the
     * lookup is retried until it answers rather than capture a miss forever.
     */
    function resolveWorkspaces(ctx) {
      if (workspacesService !== undefined) return workspacesService
      try {
        const found = typeof ctx.get === 'function' ? ctx.get('workspaces') : undefined
        if (found !== undefined && found !== null) workspacesService = found
        return found
      } catch (error) {
        report(error, 'workspaces lookup')
        return undefined
      }
    }

    /**
     * The ids the workspace browser currently holds archived.
     *
     * Archiving is how a session is put away: the sidebar stops showing it. A
     * metering page that kept counting a put-away session would answer for
     * something the user has already filed away, so these ids are excluded from
     * every total. No workspace service simply means nothing is excluded.
     *
     * The raw array from the cached snapshot is returned untouched so the value
     * stays reference-stable across renders.
     */
    function archivedIds(workspaces) {
      if (workspaces == null || workspaces.list == null || typeof workspaces.list.getSnapshot !== 'function') return NO_IDS
      try {
        const snapshot = workspaces.list.getSnapshot()
        const ids = snapshot == null ? undefined : snapshot.archivedSessionIds
        return Array.isArray(ids) ? ids : NO_IDS
      } catch (error) {
        report(error, 'archived session ids')
        return NO_IDS
      }
    }

    /** An id set from the archived list, memoised on that list's identity. */
    function archivedSetOf(ids) {
      if (!Array.isArray(ids) || ids.length === 0) return NO_ARCHIVED
      const set = new Set()
      for (const id of ids) if (typeof id === 'string' && id.length > 0) set.add(id)
      return set.size === 0 ? NO_ARCHIVED : set
    }

    /**
     * Every session the client list knows about that carries a token-usage
     * projection, newest first when timestamps are available.
     */
    function collectSessions(list, archived) {
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
        // A session the user has archived is filed away: the sidebar no longer
        // offers it, so it must not keep answering for the totals either.
        if (archived !== undefined && archived !== null && archived.has(id)) continue
        // The host's per-day fold is the real split, so it wins whenever it is
        // there. The ledger is the fallback for sessions the host has never
        // loaded - and it is still fed, so the fallback is warm if the
        // projection ever disappears.
        const exact = sessionByDay(summary)
        // Observe every session, including one that has not spent anything yet:
        // a session that starts at zero must be baselined at zero, or its first
        // real token would look like a backlog that predates the plugin.
        const observed = recordSpend(id, at, usage)
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
          byDay: exact === null ? observed : exact,
          backlog: exact === null ? SPEND.get(id).backlog : zeroUsage(),
          exact: exact !== null,
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

    /**
     * A row's usage restricted to a day range.
     *
     * The per-day buckets are what make this possible: a session's lifetime
     * total cannot be narrowed, but its days can. With no range the total is
     * returned unchanged, so an unfiltered page never depends on the buckets.
     */
    function usageInRange(row, range) {
      if (range == null) return row.usage
      const out = zeroUsage()
      for (const key of Object.keys(row.byDay)) {
        const at = parseDayKey(key)
        if (at === null || !inRange(at, range)) continue
        addInto(out, row.byDay[key])
      }
      return out
    }

    /** The subset of rows inside the range; a null range keeps everything. */
    function filterByRange(rows, range) {
      if (range == null) return rows
      const kept = []
      for (const row of rows) if (inRange(row.at, range)) kept.push(row)
      return kept
    }

    /** Local Monday (00:00) of the week containing one instant. */
    function mondayOf(at) {
      const start = dayStartOf(at)
      // getDay(): Sunday = 0 ... Saturday = 6; shift so Monday is 0.
      return start - ((new Date(start).getDay() + 6) % 7) * DAY_MS
    }

    /**
     * The adaptive heatmap grid, in column-major order: one column per week,
     * seven rows per column, Monday first.
     *
     * The window is the real span between the Monday of the first recorded week
     * and the Monday of the latest record, always rendering a full year of
     * columns. A young history leaves its oldest weeks empty rather than
     * shrinking the frame; a history longer than a year pages through
     * year-sized windows, and only then is there anything to page.
     *
     * The intensity scale is computed over the WHOLE byDay map, not over the
     * visible window, so paging or filtering never re-colours a day the user
     * already looked at.
     *
     * Days after today without a record render flat; days outside the selected
     * range are marked so the grid keeps its shape while the report narrows.
     */
    function buildHeatmap(byDay, now, locale, range, offsetWeeks = 0) {
      const todayStart = dayStartOf(now)
      let earliest = null
      let latest = null
      let peak = 0
      if (byDay !== null && byDay !== undefined && typeof byDay.forEach === 'function') {
        for (const key of byDay.keys()) {
          const at = parseDayKey(key)
          if (at === null) continue
          if (earliest === null || at < earliest) earliest = at
          if (latest === null || at > latest) latest = at
          const bucket = byDay.get(key)
          const sum = bucket === undefined || bucket === null ? 0 : totalTokens(bucket.usage)
          if (sum > peak) peak = sum
        }
      }
      // The grid always draws a FULL YEAR of columns, and column one is the
      // Monday of the first recorded week - the week the plugin first saw usage.
      //
      // Two constraints meet here. Starting at the first record is what "show me
      // my history from the beginning" means. Drawing a full year is what keeps
      // the grid readable: a nine-column grid stretched across a wide pane is
      // either a handful of enormous squares or a small block with a dead margin
      // on the right. Filling the year fixes both - the columns are a constant
      // size because there are always the same number of them.
      //
      // Weeks after today are drawn as future cells: slightly dimmer, not
      // clickable. They are filled in as time passes, so the grid reads as a
      // year in progress rather than a truncated fragment.
      const currentWeek = mondayOf(todayStart)
      const totalWeeks = HEAT_WEEKS
      const firstRecord = mondayOf(earliest === null ? currentWeek : earliest)
      const spanWeeks = Math.max(1, Math.round((currentWeek - firstRecord) / (7 * DAY_MS)) + 1)
      const paged = spanWeeks > totalWeeks
      // Page position is measured from the EARLIEST record forward: 0 shows the
      // oldest window, maxPage the newest. Omitting it lands on the newest
      // window, which still starts at the first record when history is short.
      const maxPage = Math.max(0, spanWeeks - totalWeeks)
      const requested = typeof offsetWeeks === 'number' && Number.isFinite(offsetWeeks) ? offsetWeeks : maxPage
      const page = Math.min(Math.max(0, Math.round(requested)), maxPage)
      const first = firstRecord + page * 7 * DAY_MS
      // Always a full window of columns: the grid never shrinks to the data.
      const shownWeeks = totalWeeks
      const cells = []
      const months = []
      let lastMonth = -1
      for (let week = 0; week < shownWeeks; week += 1) {
        for (let day = 0; day < 7; day += 1) {
          const at = first + (week * 7 + day) * DAY_MS
          const key = dayKeyOf(at)
          const bucket = byDay === null || byDay === undefined ? undefined : byDay.get(key)
          const usage = bucket === undefined ? null : bucket.usage
          const sum = usage === null ? 0 : totalTokens(usage)
          cells.push({
            key: key,
            at: at,
            total: sum,
            usage: usage,
            sessions: bucket === undefined ? [] : bucket.sessions,
            // Purely a date test: a cell after today is in the future whether
            // or not a stray record dates it there.
            future: at > todayStart,
            muted: !inRange(at, range),
          })
        }
        const columnDate = new Date(first + week * 7 * DAY_MS)
        const month = columnDate.getMonth()
        months.push(month === lastMonth ? '' : monthLabel(columnDate.getTime(), locale))
        lastMonth = month
      }
      const todayKey = dayKeyOf(todayStart)
      for (const cell of cells) {
        let level = 0
        if (!cell.future && cell.total > 0 && peak > 0) {
          // A square-root ramp keeps one huge day from flattening every other
          // day into the palest step. Five steps, like a contribution graph.
          level = Math.ceil(Math.sqrt(cell.total / peak) * 5)
          if (level < 1) level = 1
          if (level > 5) level = 5
        }
        cell.level = level
        // Today gets a ring so "now" is findable without reading the axis.
        cell.today = cell.key === todayKey
      }
      return {
        cells: cells,
        months: months,
        peak: peak,
        weeks: shownWeeks,
        spanWeeks: spanWeeks,
        paged: paged,
        maxOffset: maxPage,
        offset: page,
        firstAt: cells.length > 0 ? cells[0].at : null,
        lastAt: cells.length > 0 ? cells[cells.length - 1].at : null,
      }
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

    /** The smallest and largest a day cell may get, in pixels. */
    const CELL_MIN = 12
    // A year of columns must be able to fill a wide pane: 53 columns at 3px gutters
    // need about 20px each to fill 1200px, so the cap is well above that.
    const CELL_MAX = 40
    const CELL_GAP = 3

    /**
     * The pixel edge for one day cell.
     *
     * The grid must neither stretch a short history into a few enormous squares
     * (that was the `1fr` bug) nor shrink a long one into unreadable slivers. So
     * the edge is solved from the measured pane: share the available width
     * across the columns, then clamp. Below the minimum the grid overflows into
     * its scroller instead of compressing further.
     */
    function cellEdgeFor(width, weeks) {
      const columns = Number.isFinite(weeks) && weeks > 0 ? weeks : 1
      const usable = Number.isFinite(width) && width > 0 ? width - (columns - 1) * CELL_GAP : 0
      if (usable <= 0) return CELL_MIN
      const share = Math.floor(usable / columns)
      return Math.max(CELL_MIN, Math.min(CELL_MAX, share))
    }

    /**
     * The style that carries the solved cell edge to the grid and its axis.
     *
     * The grid is exactly `columns × edge + gutters` wide, so it neither leaves a
     * dead margin on the right nor overflows when the pane is wide enough. The
     * row height is a separate, slightly smaller value: a day cell reads better
     * as a wide tile than as a square, and it keeps seven rows inside a sane
     * height even when the columns are wide.
     */
    function heatGridStyle(heat, width) {
      const weeks = heat !== null && heat !== undefined && Number.isFinite(heat.weeks) && heat.weeks > 0 ? heat.weeks : 1
      const edge = cellEdgeFor(width, weeks)
      const rowHeight = Math.max(12, Math.round(edge * 0.8))
      return { '--tu-cell-w': edge + 'px', '--tu-cell-h': rowHeight + 'px', '--tu-gap': CELL_GAP + 'px' }
    }

    /**
     * The year grid with its month axis and legend.
     *
     * Cells are a fixed size and the grid scrolls horizontally when the pane is
     * narrower than a year, so the calendar keeps its proportions instead of
     * stretching. Every past cell is a button: selecting one opens that day's
     * detail, which is how a colour on the grid becomes the record it stands
     * for.
     */
    function UsageHeatmap(props) {
      const t = props.t
      const heat = props.heat
      const locale = props.locale
      const selected = props.selected
      // Measure the pane so the cells can be sized to it. A ResizeObserver keeps
      // the size right when the window or the sidebar changes; before the first
      // measurement the edge falls back to the minimum, which is always valid.
      const paneRef = React.useRef(null)
      const widthState = React.useState(0)
      const paneWidth = widthState[0]
      const setPaneWidth = widthState[1]
      React.useEffect(function () {
        const element = paneRef.current
        if (element === null || element === undefined) return undefined
        const read = function () {
          try {
            const width = element.clientWidth
            if (Number.isFinite(width) && width > 0) setPaneWidth(width)
          } catch (error) {
            report(error, 'heatmap measure')
          }
        }
        read()
        if (typeof ResizeObserver !== 'function') return undefined
        let observer
        try {
          observer = new ResizeObserver(read)
          observer.observe(element)
        } catch (error) {
          report(error, 'heatmap observe')
          return undefined
        }
        return function () {
          try { observer.disconnect() } catch (ignored) { /* already gone */ }
        }
      }, [])
      const gridStyle = heatGridStyle(heat, paneWidth)
      const cells = heat.cells.map(function (cell) {
        const classes = ['tu-cell']
        if (cell.level > 0) classes.push('l' + String(cell.level))
        if (cell.muted) classes.push('muted')
        if (cell.future) classes.push('future')
        if (cell.today) classes.push('today')
        if (selected === cell.key) classes.push('sel')
        const title = cell.future
          ? t('heatFuture', { date: dayLabel(cell.at, locale) })
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
        h('div', { className: 'tu-heat-scroll', ref: paneRef },
          h('div', { className: 'tu-heat-grid', style: gridStyle }, cells),
          h('div', { className: 'tu-heat-months', style: gridStyle }, months)),
        h('div', { className: 'tu-legend' },
          h('span', null, t('heatLess')),
          h('span', { className: 'tu-cell', disabled: true }),
          h('span', { className: 'tu-cell l1', disabled: true }),
          h('span', { className: 'tu-cell l2', disabled: true }),
          h('span', { className: 'tu-cell l3', disabled: true }),
          h('span', { className: 'tu-cell l4', disabled: true }),
          h('span', { className: 'tu-cell l5', disabled: true }),
          h('span', null, t('heatMore'))))
    }
    //#endregion

    /**
     * The window caption, plus paging controls ONLY when there is history the
     * grid cannot show at once.
     *
     * Codex and Claude both navigate usage by switching a fixed range, never by
     * dragging a continuous window: a drag gives no feedback about where you
     * are on the timeline and re-renders two weeks at every step. So an
     * in-range history gets a plain caption, and only a history longer than one
     * window gets discrete step buttons plus first/latest jumps.
     */
    function WindowBar(props) {
      const t = props.t
      const heat = props.heat
      const first = heat.firstAt === null ? '' : dayLabel(heat.firstAt, props.locale)
      const last = heat.lastAt === null ? '' : dayLabel(heat.lastAt, props.locale)
      const children = [
        h('span', { className: 'tu-window tu-num', key: 'range' }, t('windowRange', { from: first, to: last })),
      ]
      // The window is the whole history: say so, and offer nothing to drag.
      if (!heat.paged) {
        children.push(h('span', { className: 'tu-window tu-num', key: 'span' }, t('windowAll', { weeks: heat.spanWeeks })))
        return h('div', { className: 'tu-windowbar' }, children)
      }
      const step = function (delta) {
        const next = Math.min(Math.max(0, heat.offset + delta), heat.maxOffset)
        if (next !== heat.offset) props.onOffset(next)
      }
      children.push(h('div', { className: 'tu-windownav', key: 'nav' },
        h('button', {
          type: 'button',
          className: 'tu-btn tu-winbtn',
          disabled: heat.offset <= 0,
          title: t('windowFirst'),
          onClick: function () { props.onOffset(0) },
        }, '⏮'),
        h('button', {
          type: 'button',
          className: 'tu-btn tu-winbtn',
          disabled: heat.offset <= 0,
          title: t('windowPrev'),
          onClick: function () { step(-HEAT_WEEKS) },
        }, '‹'),
        h('span', { className: 'tu-window tu-num' }, t('windowPage', {
          page: Math.floor(heat.offset / HEAT_WEEKS) + 1,
          pages: Math.floor(heat.maxOffset / HEAT_WEEKS) + 1,
        })),
        h('button', {
          type: 'button',
          className: 'tu-btn tu-winbtn',
          disabled: heat.offset >= heat.maxOffset,
          title: t('windowNext'),
          onClick: function () { step(HEAT_WEEKS) },
        }, '›'),
        h('button', {
          type: 'button',
          className: 'tu-btn tu-winbtn',
          disabled: heat.offset >= heat.maxOffset,
          title: t('windowLatest'),
          onClick: function () { props.onOffset(heat.maxOffset) },
        }, '⏭')))
      return h('div', { className: 'tu-windowbar' }, children)
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

    /** Per-session table with model, cost and an optional destructive action. */
    function SessionTable(props) {
      const t = props.t
      const limit = props.limit === undefined ? 20 : props.limit
      const rows = props.rows.slice(0, limit)
      const canDelete = typeof props.onDelete === 'function'
      const headCells = [
        h('th', null, t('colSession')),
        h('th', null, t('colDay')),
        h('th', null, t('colModel')),
        h('th', { className: 'num' }, t('colInput')),
        h('th', { className: 'num' }, t('colCache')),
        h('th', { className: 'num' }, t('colOutput')),
        h('th', { className: 'num' }, t('colTotal')),
      ]
      if (canDelete) headCells.push(h('th', { className: 'act' }, t('colActions')))
      const head = h('thead', null, h('tr', null, headCells))
      const body = h('tbody', null, rows.map(function (item) {
        const name = item.title.length > 0 ? item.title : item.id
        const model = item.model === null ? t('noRate') : item.model
        const selected = props.selected === item.id
        // The day column names the session's last prompt day - the day its
        // tokens are attributed to until this run observes growth.
        const dayText = item.day === null ? t('noRate') : dayLabel(dayStartOf(item.at), props.locale)
        const dayTitle = item.day === null ? dayText : fullDayLabel(item.at, props.locale)
        const cells = [
          h('td', { className: 'name', title: name }, name),
          h('td', { className: 'day', title: dayTitle }, dayText),
          h('td', { title: model }, model),
          h('td', { className: 'num' }, formatCount(item.usage.uncachedInputTokens)),
          h('td', { className: 'num' }, formatCount(item.usage.cacheReadTokens)),
          h('td', { className: 'num' }, formatCount(item.usage.outputTokens)),
          h('td', { className: 'num' }, formatCount(item.total)),
        ]
        if (canDelete) {
          cells.push(h('td', { className: 'act' }, h('button', {
            type: 'button',
            className: 'tu-del',
            title: t('deleteSessionHint'),
            disabled: props.deletingId === item.id,
            onClick: function (event) {
              if (event != null && typeof event.stopPropagation === 'function') event.stopPropagation()
              props.onDelete(item.id, name)
            },
          }, t('deleteSession'))))
        }
        return h('tr', {
          key: item.id,
          className: selected ? 'sel' : undefined,
          onClick: props.onSelect == null ? undefined : function () { props.onSelect(item.id) },
        }, cells)
      }))
      return h('table', { className: 'tu-table' }, head, body)
    }

    /** One grouped row: a dimension value, its summed usage and its share. */
    function groupedRows(rows, dimension, range) {
      const groups = new Map()
      for (const row of rows) {
        const rowId = row.id
        const usage = usageInRange(row, range)
        const total = totalTokens(usage)
        if (total <= 0) continue
        // Two dimensions only. A workspace dimension was tried and removed:
        // the session list row the client receives carries no `cwd` (the host
        // publishes only `sessionListMetadata`: blank + lastPromptAt), so every
        // row fell into one anonymous group that read as "100%". A dimension
        // that cannot be resolved is worse than no dimension.
        const name = dimension === 'model'
          ? (row.model === null || row.model === '' ? null : row.model)
          : (row.title.length > 0 ? row.title : row.id)
        const key = name === null ? '' : name
        let group = groups.get(key)
        if (group === undefined) {
          group = { key: key, name: name, usage: zeroUsage(), total: 0, sessions: 0, unknown: name === null, ids: [] }
          groups.set(key, group)
        }
        group.ids.push(rowId)
        addInto(group.usage, usage)
        group.total += total
        group.sessions += 1
      }
      const list = [...groups.values()]
      list.sort(function (left, right) { return right.total - left.total })
      const sum = list.reduce(function (acc, item) { return acc + item.total }, 0)
      for (const item of list) item.share = sum <= 0 ? 0 : item.total / sum
      return { rows: list, sum: sum }
    }

    /** A share bar: fill width is the percentage, the label is that same figure. */
    function shareBar(share, key) {
      const percent = Math.max(0, Math.min(100, share * 100))
      return h('div', { className: 'tu-share', key: key },
        h('div', { className: 'tu-share-track' },
          h('div', { className: 'tu-share-fill', style: { width: percent.toFixed(1) + '%' } })),
        h('span', { className: 'tu-share-pct tu-num' }, percent.toFixed(percent >= 10 ? 0 : 1) + '%'))
    }

    /**
     * Usage detail, grouped the way Codex groups its usage history: pick the
     * dimension (model / workspace / session), read each row as a share bar
     * with its absolute figure beside it. Top rows first; the rest is one click
     * away instead of a wall of numbers.
     */
    function UsageTable(props) {
      const t = props.t
      const dimension = props.dimension === undefined ? 'model' : props.dimension
      const grouped = groupedRows(props.rows, dimension, props.range)
      const limit = props.expanded === true ? grouped.rows.length : 8
      const shown = grouped.rows.slice(0, limit)
      // The destructive action belongs to a single conversation, so it only
      // exists on the session dimension - deleting a whole model or workspace
      // from this table would not mean anything.
      const canDelete = typeof props.onDelete === 'function' && dimension === 'session'
      const headCells = [
        h('th', null, dimension === 'model' ? t('colModel') : t('colSession')),
        h('th', { className: 'num' }, t('colInput')),
        h('th', { className: 'num' }, t('colCache')),
        h('th', { className: 'num' }, t('colOutput')),
        h('th', { className: 'num' }, t('colTotal')),
        h('th', null, t('shareOfTotal')),
      ]
      if (canDelete) headCells.push(h('th', { className: 'act' }, t('colActions')))
      const head = h('thead', null, h('tr', null, headCells))
      const body = h('tbody', null, shown.map(function (item) {
        const label = item.unknown ? t('noRate') : item.name
        const cells = [
          h('td', { className: 'name tu-groupname', title: label }, label),
          h('td', { className: 'num' }, formatCount(item.usage.uncachedInputTokens)),
          h('td', { className: 'num' }, formatCount(item.usage.cacheReadTokens)),
          h('td', { className: 'num' }, formatCount(item.usage.outputTokens)),
          h('td', { className: 'num' }, formatCount(item.total)),
          h('td', null, shareBar(item.share, 'share')),
        ]
        if (canDelete) {
          const id = item.ids.length === 1 ? item.ids[0] : null
          cells.push(h('td', { className: 'act' }, id === null ? null : h('button', {
            type: 'button',
            className: 'tu-del',
            title: t('deleteSessionHint'),
            disabled: props.deletingId === id,
            onClick: function (event) {
              if (event != null && typeof event.stopPropagation === 'function') event.stopPropagation()
              props.onDelete(id, label)
            },
          }, t('deleteSession'))))
        }
        return h('tr', { key: 'group:' + item.key }, cells)
      }))
      const table = h('table', { className: 'tu-table' }, head, body)
      const rest = grouped.rows.length - shown.length
      const more = typeof props.onToggleExpand !== 'function' || grouped.rows.length <= 8
        ? null
        : h('button', {
          type: 'button',
          className: 'tu-btn',
          onClick: function () { props.onToggleExpand() },
        }, props.expanded === true ? t('collapse') : t('expandAll', { count: grouped.rows.length }))
      return h('div', { className: 'tu-tableblock' },
        more === null || props.expanded === true ? null : h('div', { className: 'tu-toolbar' }, more),
        table,
        props.expanded === true && more !== null ? h('div', { className: 'tu-toolbar' }, more) : null)
    }

    /**
     * Relative baselines, the way Claude frames usage: a raw token count says
     * nothing about whether it is a lot. Today is compared with the mean of the
     * preceding seven full days; this week is compared with the same span of
     * last week. Both are computed from the same per-day buckets the calendar
     * already uses, so no extra data is required.
     */
    function dailyAverage(summaryRows, now, days) {
      const todayKey = dayKeyOf(now)
      const byDay = new Map()
      for (const row of summaryRows) {
        for (const key of Object.keys(row.byDay)) {
          if (key === todayKey) continue
          const bucket = row.byDay[key]
          const total = totalTokens(bucket)
          if (total <= 0) continue
          byDay.set(key, (byDay.get(key) || 0) + total)
        }
      }
      const keys = [...byDay.keys()].sort()
      const recent = keys.slice(-days)
      if (recent.length === 0) return null
      let sum = 0
      for (const key of recent) sum += byDay.get(key)
      return sum / recent.length
    }

    /** A baseline line: the figure, the reference, and the direction. */
    function baselineRow(key, label, value, reference, t) {
      if (reference === null || !Number.isFinite(reference) || reference <= 0) return null
      const ratio = value / reference
      const percent = Math.round(ratio * 100)
      const direction = ratio >= 1.15 ? 'up' : ratio <= 0.85 ? 'down' : ''
      return h('div', { className: 'tu-base', key: key },
        h('span', null, label),
        h('span', { className: direction },
          h('b', null, formatCount(value)),
          ' · ' + percent + '%'),
        h('span', null, t('vsDailyAvg', { value: formatCount(reference) })))
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
      // Archived sessions are filed away, so they leave every total. Two hooks
      // more than a plain read: the workspace list changes when a session is
      // archived or restored, and the card has to follow.
      const workspaces = typeof props.getWorkspaces === 'function' ? props.getWorkspaces() : undefined
      const wSubscribe = React.useCallback(function (listener) {
        if (workspaces == null || workspaces.list == null || typeof workspaces.list.subscribe !== 'function') return noopSubscribe()
        let stop
        try {
          stop = workspaces.list.subscribe(listener)
        } catch (error) {
          report(error, 'workspace list subscribe')
          return noopSubscribe()
        }
        return typeof stop === 'function' ? stop : noopSubscribe()
      }, [workspaces])
      const wGetSnapshot = React.useCallback(function () { return archivedIds(workspaces) }, [workspaces])
      const archivedList = React.useSyncExternalStore(wSubscribe, wGetSnapshot, wGetSnapshot)
      const archived = React.useMemo(function () { return archivedSetOf(archivedList) }, [archivedList])

      const presetState = React.useState('all')
      const preset = presetState[0]
      const setPreset = presetState[1]
      const rangeState = React.useState(null)
      const range = rangeState[0]
      const setRange = rangeState[1]
      const dayState = React.useState(null)
      const selectedDay = dayState[0]
      const setSelectedDay = dayState[1]
      const offsetState = React.useState(null)
      const offset = offsetState[0]
      const setOffset = offsetState[1]
      const dimensionState = React.useState('model')
      const dimension = dimensionState[0]
      const setDimension = dimensionState[1]
      const expandedState = React.useState(false)
      const expanded = expandedState[0]
      const setExpanded = expandedState[1]
      const deletingState = React.useState(null)
      const deletingId = deletingState[0]
      const setDeletingId = deletingState[1]
      const deleteNoticeState = React.useState(null)
      const deleteNotice = deleteNoticeState[0]
      const setDeleteNotice = deleteNoticeState[1]

      const rows = React.useMemo(function () { return collectSessions(list, archived) }, [list, archived])
      const visible = React.useMemo(function () { return filterByRange(rows, range) }, [rows, range])
      const allSummary = React.useMemo(function () { return summarize(rows, Date.now()) }, [rows])
      const summary = React.useMemo(function () { return summarize(visible, Date.now()) }, [visible])
      const heat = React.useMemo(function () { return buildHeatmap(allSummary.byDay, Date.now(), locale, range, offset) }, [allSummary, locale, range, offset])
      // The picked day is resolved against EVERY day, not against the visible
      // window: paging must never make an open drill-down vanish.
      const pickedCell = React.useMemo(function () {
        if (selectedDay === null) return null
        const bucket = allSummary.byDay.get(selectedDay)
        const at = parseDayKey(selectedDay)
        if (at === null) return null
        return {
          key: selectedDay,
          at: at,
          total: bucket === undefined ? 0 : totalTokens(bucket.usage),
          usage: bucket === undefined ? null : bucket.usage,
          sessions: bucket === undefined ? [] : bucket.sessions,
        }
      }, [allSummary, selectedDay])
      const todayAvg = React.useMemo(function () { return dailyAverage(rows, Date.now(), 7) }, [rows])

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

      /** Confirm and run one destructive delete, reporting the host's answer inline. */
      const handleDelete = function (id, title) {
        if (typeof props.deleteSession !== 'function') return
        let confirmed = true
        try {
          if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            confirmed = window.confirm(t('deleteConfirm', { title: title }))
          }
        } catch (error) {
          confirmed = false
        }
        if (!confirmed) return
        setDeleteNotice(null)
        setDeletingId(id)
        Promise.resolve(props.deleteSession(id)).then(function () {
          setDeleteNotice(t('deleteDone'))
        }).catch(function (error) {
          const message = error instanceof Error ? error.message : String(error)
          setDeleteNotice(t('deleteFailed', { message: message }))
        }).finally(function () {
          setDeletingId(null)
        })
      }

      if (sessions == null) {
        return h('div', { className: 'tu-section' },
          h('h3', { className: 'tu-h' }, t('title')),
          h('p', { className: 'tu-empty' }, t('unavailable')))
      }

      // Every figure on this page answers for the selected range, so the cards
      // move with the filter exactly as the calendar and the table already do.
      // The range total gets its own label: calling a windowed figure "all time"
      // would be the one thing worse than not filtering it.
      //
      // There is deliberately NO "this session" card. This page lives in the
      // main column, which is ROOT-scoped: the host exposes no active-session
      // id there (usePanelInfo carries only the panel id), so the card could
      // only guess - and it guessed the newest session, which is not the one
      // the user is looking at. A wrong number is worse than no card; the
      // composer reading already answers "this session" where it can.
      const cards = h('div', { className: 'tu-cards' },
        summaryCard('today', t('cardToday'), summary.today, usageDetail(summary.today, t)),
        summaryCard('total', range === null ? t('cardTotal') : t('cardRange'), summary.total, usageDetail(summary.total, t)))

      const rangeHint = t('rangeSummary', {
        sessions: visible.length,
        tokens: formatCount(totalTokens(summary.total)),
      })

      const heatChildren = [
        h('h3', { className: 'tu-h' }, t('heatTitle')),
        h('p', { className: 'tu-hint tu-num' }, t('heatTotal', {
          total: formatCount(totalTokens(summary.total)),
          input: formatCount(summary.total.uncachedInputTokens),
          cache: formatCount(summary.total.cacheReadTokens),
          output: formatCount(summary.total.outputTokens),
        })),
      ]
      if (allSummary.backlogSessions > 0) {
        heatChildren.push(h('p', { className: 'tu-hint tu-num' }, t('carry', {
          tokens: formatCount(totalTokens(allSummary.backlog)),
          sessions: allSummary.backlogSessions,
        })))
      }
      if (allSummary.dated > 0) heatChildren.push(UsageHeatmap({ t: t, heat: heat, locale: locale, selected: selectedDay, onSelect: setSelectedDay }))
      if (allSummary.dated > 0) heatChildren.push(WindowBar({ t: t, heat: heat, locale: locale, onOffset: setOffset }))
      heatChildren.push(DayDetail({ t: t, locale: locale, cell: pickedCell }))
      const heatBlock = h('div', { className: 'tu-group' }, heatChildren)

      const dimensions = ['model', 'session']
      const dimensionTabs = h('div', { className: 'tu-toolbar' }, dimensions.map(function (name) {
        return h('button', {
          key: name,
          type: 'button',
          className: dimension === name ? 'tu-preset active' : 'tu-preset',
          onClick: function () { setDimension(name); setExpanded(false) },
        }, name === 'model' ? t('groupByModel') : t('groupBySession'))
      }))
      const baseline = baselineRow('today', t('cardToday'), totalTokens(summary.today), todayAvg, t)
      const tableBlock = h('div', { className: 'tu-group' },
        h('h3', { className: 'tu-h' }, t('tableTitle')),
        h('p', { className: 'tu-hint' }, rangeHint),
        baseline,
        deleteNotice === null ? null : h('p', { className: 'tu-hint tu-del-notice' }, deleteNotice),
        visible.length > 0
          ? h('div', { className: 'tu-tableblock' },
            dimensionTabs,
            UsageTable({
              t: t,
              rows: visible,
              range: range,
              dimension: dimension,
              expanded: expanded,
              onToggleExpand: function () { setExpanded(!expanded) },
              deletingId: deletingId,
              onDelete: typeof props.deleteSession === 'function' ? handleDelete : null,
            }),
            typeof props.deleteSession === 'function'
              ? h('p', { className: 'tu-hint' }, t('deleteSessionHint'))
              : null)
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
      // The settings grid may start at an old first record and can be shorter
      // than a fortnight of elapsed days; the sidebar card always keeps its
      // fixed 14-bar shape by padding unwatched days with empty stubs.
      const byKey = new Map()
      for (const cell of cells) byKey.set(cell.key, cell)
      const lastAt = elapsed.length > 0 ? elapsed[elapsed.length - 1].at : dayStartOf(Date.now())
      const recent = []
      for (let i = 13; i >= 0; i -= 1) {
        const at = lastAt - i * DAY_MS
        const key = dayKeyOf(at)
        recent.push(byKey.get(key) || { key: key, at: at, total: 0, future: false })
      }
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
      // Archived sessions are filed away, so they leave every total. Two hooks
      // more than a plain read: the workspace list changes when a session is
      // archived or restored, and the card has to follow.
      const workspaces = typeof props.getWorkspaces === 'function' ? props.getWorkspaces() : undefined
      const wSubscribe = React.useCallback(function (listener) {
        if (workspaces == null || workspaces.list == null || typeof workspaces.list.subscribe !== 'function') return noopSubscribe()
        let stop
        try {
          stop = workspaces.list.subscribe(listener)
        } catch (error) {
          report(error, 'workspace list subscribe')
          return noopSubscribe()
        }
        return typeof stop === 'function' ? stop : noopSubscribe()
      }, [workspaces])
      const wGetSnapshot = React.useCallback(function () { return archivedIds(workspaces) }, [workspaces])
      const archivedList = React.useSyncExternalStore(wSubscribe, wGetSnapshot, wGetSnapshot)
      const archived = React.useMemo(function () { return archivedSetOf(archivedList) }, [archivedList])
      const rows = React.useMemo(function () { return collectSessions(list, archived) }, [list, archived])
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
      const heat = buildHeatmap(summary.byDay, Date.now(), currentLocale(), null)
      // Resolve the picked day from the whole map: a bar stays pickable even
      // when the 26-week viewport had to page past it.
      const pickedBucket = selected === null ? undefined : summary.byDay.get(selected)
      const pickedAt = selected === null ? null : parseDayKey(selected)
      const picked = selected === null || pickedAt === null
        ? null
        : {
          at: pickedAt,
          total: pickedBucket === undefined ? 0 : totalTokens(pickedBucket.usage),
          usage: pickedBucket === undefined ? null : pickedBucket.usage,
        }
      const pickLine = picked === null
        ? null
        : h('div', { className: 'tu-side-line tu-side-pick' },
            h('span', null, fullDayLabel(picked.at, currentLocale())),
            h('b', { className: 'tu-num' }, formatCount(picked.total)))
      const pickDetail = picked === null || picked.usage === null
        ? null
        : h('div', { className: 'tu-side-line tu-side-pick' },
            h('span', null, t('cardDetail', {
              input: formatCount(picked.usage.uncachedInputTokens),
              cache: formatCount(picked.usage.cacheReadTokens),
              output: formatCount(picked.usage.outputTokens),
            })))
      // Claude frames usage against a reference, never as a bare number: today
      // against the trailing daily mean, so "a lot or a little" is answerable
      // at a glance without opening the settings page.
      const sideAvg = dailyAverage(rows, Date.now(), 7)
      const todayRatio = sideAvg === null || sideAvg <= 0 ? null : today / sideAvg
      const todayClass = todayRatio === null ? '' : todayRatio >= 1.15 ? ' up' : todayRatio <= 0.85 ? ' down' : ''
      const todayLine = h('div', { className: 'tu-side-line' },
        h('span', null, t('cardToday')),
        h('b', { className: 'tu-num' + todayClass }, formatCount(today),
          todayRatio === null ? '' : ' · ' + Math.round(todayRatio * 100) + '%'))
      const baseLine = sideAvg === null
        ? null
        : h('div', { className: 'tu-side-line tu-side-base' },
            h('span', null, t('vsDailyAvg', { value: formatCount(sideAvg) })))
      const rateText = hitRateText(summary.total)
      const rateLine = rateText === null
        ? null
        : h('div', { className: 'tu-side-line' },
            h('span', null, t('hitRate')),
            h('b', { className: 'tu-num' }, rateText))
      return h('div', { className: 'tu-side' },
        h('div', { className: 'tu-side-head' },
          h('span', { className: 'tu-side-brand' }, glyph(), t('title')),
          h('span', { className: 'tu-side-total tu-num' }, formatCount(total))),
        sparkline(heat.cells, setSelected, selected, t, currentLocale()),
        pickLine,
        pickDetail,
        todayLine,
        baseLine,
        rateLine,
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

    /**
     * The full main-column panel (the `main` slot).
     *
     * The host routes a sidebar entry id to the `main` cell registered under the
     * same key, so this is a REAL full-size page - not a modal, not a portal:
     * the same arrangement the shipped Plugins and Automation-tasks panels use.
     * It renders the very same report as the settings section, wrapped in a page
     * heading, so there is one implementation and two seats.
     */
    function UsagePage(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackT
      const section = h(MeterBoundary, null, h(UsageSection, props))
      return h(MeterBoundary, null,
        h('div', { className: 'tu-page' },
          h('h2', { className: 'tu-page-h' }, t('pageTitle')),
          h('p', { className: 'tu-page-sub' }, t('pageSubtitle')),
          section))
    }

    /**
     * The sidebar panel-list icon (the `sidebar.panellist` slot).
     *
     * Same three-bar mark as the composer reading, so the panel and the reading
     * share one visual identity. Size is supplied by the owner row.
     */
    function PanelListIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 16
      return h('svg', {
        className: 'tu-panellist-icon',
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': true,
        focusable: false,
      },
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

      /** Menu text that follows the host locale, with the browser fallback. */
      const menuT = function (key, vars) {
        try {
          if (localeService != null && typeof localeService.bind === 'function') return localeService.bind(NS)(key, vars)
        } catch (error) {
          // Fall through to the bundled dictionary.
        }
        return fallbackT(key, vars)
      }

      /**
       * Add Delete session to the sidebar Session row context menu.
       *
       * This is the same destructive operation as the Settings table button,
       * but it sits next to Rename/Fork/Archive in the menu the user actually
       * reaches by right-clicking a conversation in the workspace list.
       */
      const registerSessionMenu = function (menuCtx) {
        const menus = menuCtx != null && menuCtx.contextMenus != null
          ? menuCtx.contextMenus
          : (typeof ctx.get === 'function' ? ctx.get('contextMenus') : undefined)
        if (menus == null || typeof menus.register !== 'function') return
        try {
          const dispose = menus.register({
            id: 'dsh-token-usage.delete-session',
            target: 'session',
            order: 700,
            resolve: function (target) {
              const sessionId = target != null && target.sessionId != null ? String(target.sessionId) : ''
              if (sessionId.length === 0) return []
              const title = target != null && typeof target.displayTitle === 'string' && target.displayTitle.length > 0
                ? target.displayTitle
                : sessionId
              return [{
                id: 'delete',
                label: menuT('deleteSessionMenu'),
                icon: { key: 'workspace.delete' },
                danger: true,
                separatorBefore: true,
                run: function () {
                  let confirmed = true
                  try {
                    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
                      confirmed = window.confirm(menuT('deleteConfirm', { title: title }))
                    }
                  } catch (error) {
                    confirmed = false
                  }
                  if (!confirmed) return
                  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
                  deleteSessionOnHost(ctx, sessions, sessionId).catch(function (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    try {
                      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
                        window.alert(menuT('deleteFailed', { message: message }))
                      }
                    } catch (alertError) {
                      // A blocked alert must not turn a deletion failure into a throw.
                    }
                  })
                },
              }]
            },
          })
          if (typeof ctx.effect === 'function') ctx.effect(function () { return dispose }, 'token-usage: session delete menu')
        } catch (error) {
          report(error, 'session delete menu')
        }
      }

      /** Register one seat; the slot key may simply never be declared. */
      const seat = function (slotKey, order, extra, sessionsFor, component) {
        try {
          return slots.inject(slotKey, function () {
            if (typeof slots.register !== 'function') return undefined
            const options = { name: slotKey, id: ENTRY_ID, order: order, locale: localeOption, inject: function () { return { sessions: sessionsFor, getWorkspaces: function () { return resolveWorkspaces(ctx) }, deleteSession: function (sessionId) { return deleteSessionOnHost(ctx, sessionsFor, sessionId) } } } }
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

      /**
       * Register the full main-column panel under PANEL_KEY.
       *
       * A `main` registration is keyed, not id'd: the sidebar selects a panel by
       * calling into the layout with an id, and the layout renders the main cell
       * whose key matches. The label lives on the sidebar registration, so this
       * one carries no label of its own.
       */
      const mainSeat = function (key, sessionsFor) {
        try {
          return slots.inject('main', function () {
            if (typeof slots.register !== 'function') return undefined
            try {
              return slots.register({
                name: 'main',
                key: key,
                locale: localeOption,
                inject: function () {
                  return { sessions: sessionsFor, getWorkspaces: function () { return resolveWorkspaces(ctx) }, deleteSession: function (sessionId) { return deleteSessionOnHost(ctx, sessionsFor, sessionId) } }
                },
              }, UsagePage)
            } catch (error) {
              report(error, 'main register')
              return undefined
            }
          })
        } catch (error) {
          report(error, 'main inject')
          return undefined
        }
      }

      /**
       * Register the sidebar panel-list icon that opens that panel.
       *
       * The owner row supplies `size` and `active`, so the icon is drawn at the
       * size the sidebar asks for. The label is a thunk so it follows the active
       * locale without re-registering.
       */
      const panelIconSeat = function () {
        try {
          return slots.inject('sidebar.panellist', function () {
            if (typeof slots.register !== 'function') return undefined
            const label = function () {
              return (readHostLocale(localeService) || currentLocale()) === 'zh' ? MESSAGES.zh.panelLabel : MESSAGES.en.panelLabel
            }
            try {
              return slots.register({ name: 'sidebar.panellist', id: PANEL_KEY, order: PANEL_ORDER, label: label, locale: localeOption }, PanelListIcon)
            } catch (error) {
              report(error, 'sidebar.panellist register')
              return undefined
            }
          })
        } catch (error) {
          report(error, 'sidebar.panellist inject')
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
          // The Settings section seat was REMOVED on request: the report now
          // lives only in the main-column panel. Two entries for one report
          // meant two places to drift apart, and the panel is the roomier one.
          // (UsageSection is unchanged; UsagePage renders it.)
          //
          // ---- the full main-column panel + its sidebar icon ----
          //
          // A `main` cell registers the page the sidebar switcher selects, and
          // `sidebar.panellist` registers the icon row that selects it. Both use
          // the SAME key (PANEL_KEY): the sidebar resolves an entry id to the
          // main cell with that key, so the two registrations are one feature.
          // This is the arrangement the shipped Plugins and Automation panels
          // use - a real page in the main column, never a modal or a portal.
          mainSeat(PANEL_KEY, sessionsFor),
          panelIconSeat(sessionsFor),
        ]
        return function () {
          for (const dispose of disposers) if (typeof dispose === 'function') dispose()
        }
      }
      if (typeof ctx.inject === 'function') ctx.inject(['sessions'], registerCrossSession)
      else registerCrossSession(null)
      // The sidebar context menu is its own optional face: a host without the
      // context-menu service keeps every readout and loses only this entry.
      if (typeof ctx.inject === 'function') ctx.inject(['contextMenus'], registerSessionMenu)
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
