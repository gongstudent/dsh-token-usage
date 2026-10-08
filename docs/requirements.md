# DSH Token 用量插件 — 需求文档（v1）

> 交付物性质：本文件是**独立文档**，不依赖任何已有仓库。请把它放进新仓库（建议 `docs/requirements.md`）。
> 文档中的每条环境事实都标注了「已实测」或「待实测」。

---

## 0. 首要前提（不可妥协，其他所有设计让位于此）

**插件不得因为后续 DeepSeek Harness 版本更新而出现错误。**

这条要拆成可执行、可验收的不变式，否则无法判定做到没做到：

| # | 不变式 | 验收方式 |
|---|---|---|
| **N1** | 本插件任何渲染失败，都不得影响宿主界面与其他插件 | 故意注入一个抛异常的渲染分支，确认只有本 entry 消失/降级，宿主与其他 slot 正常 |
| **N2** | 不得依赖会在版本间改名的内部实现细节 | 代码审查：只出现平台公开面（slot key、projection key、`ctx.locale`、`ctx.effect`、DOM 标准 API） |
| **N3** | 任何外部数据缺失都必须降级为「不显示」，绝不抛错 | 单元测试：把 `useProjection` 返回 `undefined`、`sessionId` 为 `undefined`、locale 服务缺失，逐一断言不抛 |
| **N4** | 装配期（`slots.register` / `ctx.locale.register` / `inject` 工厂）绝不允许抛 | 见 §5.3、§7.2 的两条硬规则 |
| **N5** | 卸载不留残留 | 禁用插件后：注入的 `<style>` 被平台摘掉、无遗留全局变量、无未清理定时器 |
| **N6** | 包声明不得锁死 DSH 版本上限 | `package.json` 的 `dsh.compatibility` 只写下限，不写 `<x.y.z` 上限 |

### 0.1 为什么这前提是「可满足」的（已实测证据）

平台自己就为这件事做了两层保护，我方只要**不去对抗它**即可：

**① 平台有 per-entry 的崩溃隔离。** `dsh-client-ui-renderer/lib/client.js:601-625`：
`
/**
 * Per-entry isolation: one registrant crashing (component render or inject
 * factory) must not take down siblings. Assembly errors (missing providers)
 * rethrow — a miswired shell must fail loud, not degrade into fallbacks.
 * Every catch reports through onEntryError (the ledger's supervision seam) ...
 */
var SlotErrorBoundary = class extends react.Component {
  state = { failed: false };
  static getDerivedStateFromError(error) {
    if (error instanceof SlotAssemblyError) throw error;   // <- 装配错会穿透
    return { failed: true };
  }
  componentDidCatch(error) { console.error("slot entry crashed in '" + this.props.slotKey + "':", error); ... }
  render() { return this.state.failed ? jsx("div", { "data-slot-error": this.props.slotKey }) : this.props.children; }
};
`
→ **渲染期抛异常只毁掉自己这一个 entry**，兄弟 entry 存活，界面上留一个 `div[data-slot-error]` 占位。
→ **但 `SlotAssemblyError` 会 rethrow**（@:614）——装配期错误会「fail loud」。这就是 N4 存在的原因：**绝不能在装配期抛**。

**② 未知的 projection key 不会抛，会退化成 `undefined`。** `dsh-client-ui-renderer/lib/client.js:249-...` `keyedObservableHook`：
`
return observableHook(key === void 0 ? absentSource : source(key) ?? absentSource)(selector ?? identity, comparison);
`
`useProjection` 就是这个 keyed hook（`standardHookPropName('projection') === 'useProjection'`，`dsh-client-ui-slots/lib/index.js:7-11`；resolver 是 `dsh-client-ui-session/lib/client.js:127` `keyedHooks: { projection: (key) => binding.session.projections.faceOf(key) }`）。
→ **未来 DSH 若移除/改名 `tokenUsage` 投影，`useProjection('tokenUsage')` 返回 `undefined`，不抛。** 这是本方案能成立的地基。

---

## 1. 目标 / 非目标

### 1.1 目标
一个**只读**的 token 用量查看器：在当前会话的输入框区域显示本会话 token 用量，点击可展开明细。

### 1.2 非目标（v1 明确不做）
- ❌ 不做费用/计价（不读价格表，不算钱）
- ❌ 不做余额 / Coding Plan / 网关额度查询
- ❌ 不做历史账本、不做任何持久化
- ❌ 不做跨会话统计页
- ❌ **不写 Host 半边业务逻辑、不自建 RPC、不自建 Typert 面**
- ❌ 不 import 任何 Harness Client 包（含 `dsh-client-ui-primitives`）
- ❌ 不写宿主 DOM、不 `document.body.appendChild`、不用 iframe

> 「不写 Host 半边业务逻辑」≠「没有 host 文件」。client-modules 的加载契约是**宿主扫描 Loader entry**，所以包必须有一个可加载的 host 入口（见 §8）。但它是一个**空插件**，只有 `export const name` 和 `export function apply() {}`。宿主侧零业务代码 = 宿主侧零版本风险。

---

## 2. 目标运行环境（全部已实测）

| 项 | 值 | 实测方式 |
|---|---|---|
| 运行形态 | DeepSeek Harness **Desktop**（Electron） | `Win32_Process` 命令行：`--expose-internals ...\dsh-desktop-host\lib\index.js ... C:\Users\EDY\.dsh\profiles\desktop` |
| 打包的 DSH 版本 | **0.2.0-rc.2** | `app.asar/dsh/package.json` |
| 目标 profile | `desktop`，位于 `C:\Users\EDY\.dsh\profiles\desktop` | 同上 |
| GUI 地址 | `http://127.0.0.1:19387`（端口硬编码于 `dsh-desktop-host/lib/index.js:231-235`） | 进程命令行 + `netstat` |
| 客户端模块种子表 | `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit` | `dsh-web-frontend/dist/assets/index-5SrrfWpU.js:126` |
| 主题深色选择器 | `body[data-ds-dark-theme]`（浅色 = `body`） | `dsh-client-ui-theme/lib/client.js:1148` |
| 样式自动清理 | 平台在 entry teardown 时移除 `style[data-plugin="<包名>"]` | `dsh-client-modules/lib/client.js:196` |

> ⚠️ **不要参考 `D:\个人项目\deepseek-harness`** —— 那是一个 **0.1.0-rc.5** 的旧源码 checkout，profile 里的 `@deepseek-ai/*` junction 指向它。与运行中的 0.2.0-rc.2 有实质差异（例如 `dsh-client-runtime` 在 0.2.0-rc.2 里已不存在）。**API 依据一律以 app.asar 内 0.2.0-rc.2 为准。**

---

## 3. v1 功能范围（小而完整）

单一挂载面：`conversation.composer.dock`。

### 3.1 折叠态（默认）
输入框区域一个紧凑读数，与宿主自带的 ContextMeter 并排：

`
[用量] 12.4k · 命中 87.3%
`

- 内容：本会话**四桶合计** token 数（K/M 缩写）+ 缓存命中率
- 无数据（`tokenUsage` 为 `undefined` 或四桶全 0）→ **整个 entry 返回 `null`，不渲染任何东西**
- 键盘可达：`role="button"` + `tabIndex={0}` + Enter/Space 展开

### 3.2 展开态
点开后展开一块明细面板（**不用 portal**，绝对定位在自身 wrapper 内）：

`
本会话 Token 用量
─────────────────────
未命中输入    3,120
缓存读       41,880      命中率 87.3%
缓存写        2,048
输出          1,530
─────────────────────
上下文占用   ~45.2k / 200k   [====------]  22.6%
  系统提示   ~6,100
  工具定义   ~9,400
  对话       ~29,700
─────────────────────
更新于 14:32:07              [刷新]
`

- 四桶数字来自 `tokenUsage`（`uncachedInputTokens / outputTokens / cacheReadTokens / cacheWriteTokens`）
- 命中率 = `cacheRead / (uncachedInput + cacheRead + cacheWrite)`，分母 0 时显示 `—`
- 上下文占用条来自 `contextPressure`（`projectedTokens ?? pressureTokens` / `contextWindow`）；任一缺失则**整段不渲染**
- 组成三项来自 `contextBreakdown`；缺失则**整段不渲染**
- `[刷新]`：重新读取投影快照并更新「更新于」时间戳（投影本身是推送的，刷新是显式重读，给用户一个确定的反馈）
- `Esc@@ 关闭；点击面板外关闭；`[刷新]` 是唯一可聚焦元素之一

### 3.3 状态处理（三态都要有，且都不许抛）

| 状态 | 表现 |
|---|---|
| 加载中 / 无数据 | entry 返回 `null`（静默不显示，不放「加载中」占位，避免输入框区域抖动） |
| 正常 | 见 3.1 / 3.2 |
| 组件内部异常 | 被平台 `SlotErrorBoundary` 隔离；我方额外用自带 ErrorBoundary 兜一层，失败时返回 `null`（而不是让平台留一个 `div[data-slot-error]` 占位） |

---

## 4. 数据来源与降级链

**全部来自 `@deepseek-ai/dsh-token-meter` 已注册的会话投影**（该包由 `dsh-base` 默认挂载，实测 `--dump-config` 可见 `- id: token-meter`）。**不自建 Host 半边，不自建 RPC。**

| 数据 | 入口 | 类型 | 缺失时的降级 |
|---|---|---|---|
| 本会话 token 四桶 | `props.useProjection('tokenUsage')` | `{uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}` | 返回 `null`（整个 entry 不渲染） |
| 上下文占用 | `props.useProjection('contextPressure')` | `{pressureTokens?, projectedTokens?, contextWindow?}` | 该段不渲染，其余照常 |
| 上下文组成 | `props.useProjection('contextBreakdown')` | `{systemTokens, toolsTokens, messageTokens}` | 该段不渲染，其余照常 |
| 会话 id | `props.sessionId`（slot scope = session 自带） | string | 为 `undefined` 时返回 `null` |

### 4.1 口径定义（与宿主一致，不自创）
- 四个桶**互斥**：`uncachedInputTokens` 不含缓存部分；`outputTokens` 已包含推理 token（不要重复加）
- 命中率分母 = `uncachedInputTokens + cacheReadTokens + cacheWriteTokens`（cacheWrite 计入分母但不是命中）—— 与 `docs/billing-statistics.md:31` 的口径一致
- `contextBreakdown` 三项是**启发式估算**，三者之和不等于 `contextPressure.projectedTokens@@；界面上必须以 `~` 前缀标明是估算（宿主 `ContextMeter` 就是这么做的，`dsh-client-ui-conversation/lib/client.js:17106,17124`）

### 4.2 为什么不需要 Host 半边
`tokenUsage` / `contextPressure` / `contextBreakdown` 已经是 `dsh-token-meter` 注册好的投影（`dsh-token-meter/lib/index.js:613-615`），宿主通过 session projection 机制推给客户端。我方**只读**，不参与写入，因此宿主侧零代码、零版本风险。

---

## 5. UI 选址与降级

### 5.1 选 `conversation.composer.dock`

| 候选 | kind / scope | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| **`conversation.composer.dock`** | `list / session` | 与宿主自带 ContextMeter 并排（语义同类）；天然拿到 `sessionId`；输入框区域是看用量的自然位置 | 仅在有活跃会话的 composer 变体渲染 | ✅ **v1 选它** |
| `conversation.input.dock` | list / session | 渲染在输入卡片**上方**，横向空间更宽 | 会占一整行，与宿主已有的 dock 内容抢位置 | 备选 |
| `sidebar.footer.action` | list / root | 常驻，入口 props 带 `wide` | root 作用域，**拿不到 `sessionId`**，要做「当前会话」得自己遍历 `ctx.sessions.list` | 不做 |
| `settings.section` | list / root | 适合放明细页 | 同上，且是第二块 UI 面 | v1 不做 |

实测该 slot 在当前组合里存在：`dsh-client-ui-conversation` 在 profile 组合中（`--dump-config --profile web` 输出含 `- id: ui-conversation`），slot 声明于 `dsh-client-ui-conversation/lib/client.js:18329-18331` `kind: "list", scope: "session"`。

### 5.2 渲染位置（先讲位置，再讲样式）
`conversation.composer.dock` 的出口在输入栏 composer 变体的控制行里，与 `ContextMeter` 并列（`dsh-client-ui-conversation/lib/client.js:17615-17617`）：
`
children: [variant === "composer" && input !== void 0 && sessionId !== void 0 ? renderSlot("conversation.composer.dock", {}) : null,
           activity ? null : jsx(ContextMeter, { useProjection, t })]
`
→ 我方 entry 是这一行里的一个 flex item。**必须自己控制宽度**（`flex: 0 1 auto; min-width: 0; max-width: 100%`），否则会挤掉 ContextMeter。

### 5.3 降级规则（N2 / N4）
- **必须用 `ctx.slots.inject(key, cb)`，不能用 `ctx.slots.register()` 直接注册。**
  依据：`dsh-client-ui-slots/lib/index.js:165` `if (!rec?.spec) throw new Error("slot \"" + options.name + "\" is not declared ...")` —— 直接 register 在 slot 未声明时**抛异常**；`inject` 是「等父级声明后再执行」，slot 永远不出现时回调永远不执行，**静默无副作用**。
- 若未来 DSH 改名/移除该 slot → entry 静默不出现，**不报错**。这是可接受的降级，但要写进 README 排障章节。
- `options.id` 必须提供（list slot 强制，`dsh-client-ui-slots/lib/index.js:182`），否则抛。

---

## 6. 主题 token 决策

### 6.1 两个候选都验证过可行
- **方案 A（放宽白名单，直接用平台变量）**：已实测这些变量在 0.2.0-rc.2 的 `design-platform.css` 里有定义 ——
  `--dsw-radius-xs/sm/md/lg/xl/panel` = `4/8/12/16/20/28px`、`--dsw-elevation-panel/prominent/soft`、`--dsw-corner-shape: superellipse(1.5)`、`--dsw-focus-ring-width/color`。可行。
- **方案 B（保持严格，按参考仓库硬编码数值）**：参考仓库主样式表就是这么做的（每个圆角/阴影都写死，`01-open-styles-i18n.js:271,280,91,165`），只有 statistics 分包用了 `--dsw-radius-*`。可行。

### 6.2 推荐方案 C（A 的稳健版，本方案采用）
**放宽白名单，但每个平台变量都带字面量兜底：**
`
border-radius: var(--dsw-radius-md, 12px);
box-shadow: var(--dsw-elevation-panel, 0 3px 8px #00000010);
`

理由（直接服务于 §0 的 N2/N3）：
- 纯 A 的风险：变量被移除时 `var()` 不回落 → 该声明在计算值阶段整条失效（IACVT）→ 圆角/阴影突然消失。参考仓库为这个坑专门写过注释（`03-settings-panels-main.js:31-34`）。
- 纯 B 的风险：宿主改圆角尺度时我方视觉脱节。
- 带兜底的 A：**宿主有则跟随，没有则退化成合法字面量**，两种未来都不会「坏掉」。

### 6.3 颜色的硬规则
**颜色只允许用 `--dsw-alias-*`，且必须带兜底。** 因为 alias 在 `body` / `body[data-ds-dark-theme]` 下有两套定义，硬编码颜色必然在其中一个主题下不协调。实测可用的浅/深对照：

| token | 浅色 | 深色 |
|---|---|---|
| `--dsw-alias-label-primary` | #0f1115 | #f9fafb |
| `--dsw-alias-label-secondary` | #61666b | #cfd3d6 |
| `--dsw-alias-label-tertiary` | #81858c | #adb2b8 |
| `--dsw-alias-bg-base` | #fff | #151517 |
| `--dsw-alias-bg-layer-1` | #fff | #232324 |
| `--dsw-alias-bg-layer-2` | #fff | #2c2c2e |
| `--dsw-alias-border-l1` | #0000000a | #ffffff0f |
| `--dsw-alias-interactive-bg-hover` | #2631480f | #ffffff14 |
| `--dsw-alias-state-business-primary` | 品牌色 | 品牌色 |

**禁用清单**（参考仓库踩过的坑，实测这些 token 在 0.2.0-rc.2 **不存在**）：
`--dsw-alias-bg-hover`、`--dsw-alias-state-info-primary`、`--dsw-alias-state-ok-primary`、`--dsw-alias-state-warning-primary`（正确名 `state-warn-primary`）、`--dsw-alias-interactive-text-hover`。
构建期脚本必须**逐个断言用到的 token 在 `design-platform.css` 里有定义**。

### 6.4 样式注入
抄参考仓库验证过的**内容比对式**注入（`test/client-style-injection.mjs` 锁死了三条不变式）：
`
const TAG_ID = '<包名>/client.css'
const existing = document.querySelector('style[data-plugin-css=' + JSON.stringify(TAG_ID) + ']')
if (existing?.textContent !== css) {
  const tag = existing ?? document.createElement('style')
  tag.dataset.plugin = '<包名>'          // <- 平台据此在 teardown 时自动移除
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = css
  if (existing === null) document.head.appendChild(tag)
}
`
- 必须判**内容**而不是只判 id：DSH client HMR 会不刷新页面换掉插件代码，旧节点会让新规则失效。
- 注入位置是 `document.head`（平台内所有内置包都这么做），**不是 `document.body`**。
- 额外：我方在 `ctx.effect` 里返回一个 disposer，主动移除自己的 `<style>`，不单靠平台（N5）。

---

## 7. 国际化

### 7.1 用平台原生
`
const NS = 'token-usage'
ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'token-usage: dictionaries')
`
- 组件里由框架注入 `t`（slot 注册带 `locale: NS` 即自动获得），**不自造 `makeT`**
- key 命名：扁平 lowerCamelCase，无命名空间前缀（`title` / `uncachedInput` / `cacheRead` / `hitRate` / `contextUsage` / `refresh` / `updatedAt` …），约 20 个 key
- 占位符 `{value}`

### 7.2 两条硬规则
1. **`locale` 只在 locale 服务确实存在时才写进 slot options。** 依据 `dsh-client-ui-renderer/lib/client.js:721-725`：
   `
   if (entry.locale !== void 0) {
     const face = host.locale;
     if (face === void 0) throw new SlotAssemblyError("entry declares locale namespace '" + entry.locale + "' but no locale face is installed ...");
   `
   → locale 插件缺失时**装配期抛错**，违反 N4。做法：`...(ctx.get('locale') ? { locale: NS } : {})`；并用内置英文兜底字典保证文案仍可读。
2. **`ctx.locale.register` 必须特性检测**：`if (typeof ctx.locale?.register === 'function')`；否则用内置字典。

### 7.3 中英 key 对等门禁（**参考仓库没有做到，我方必须做**）
实测参考仓库 zh/en 各 514 key、零单边，但**没有任何全量对等的门禁**：构建期只做 `\0` 往返断言（单边 key 会静默通过），测试只做逐 key 的 `count === 2` 抽查。

我方：`scripts/check.mjs` 里加一条**集合严格相等**断言：
`
assert.deepEqual([...Object.keys(zh)].sort(), [...Object.keys(en)].sort(), 'zh/en key 集合必须严格相等')
`
并纳入 `pnpm test`。

---

## 8. 打包与安装

### 8.1 包形态（已用一次性探针包实测通过）
`package.json`：
`json
{
  "name": "dsh-token-usage",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json"
  },
  "files": ["lib", "cordis.patch.yml", "README.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" }
  }
}
`
- `dsh.bundle.patch` 是**必需**的：`dsh plugin add` 之后 `reconcilePlugins()` 靠它决定是否把包加进 `dsh.profile.bundles`（`...\@deepseek-ai\dsh\lib\plugin-9h8shc4d.js:46-78`）。没有它只会装成普通依赖并打印 warning（@:57）。
- `dsh.client.platform` 固定 `"web"` —— **desktop 也用 "web"**，已由 profile 里在用的 `dsh-cline-pass` 证实。
- `dsh.compatibility` **只写下限、不写上界**（N6）。

`cordis.patch.yml`：
`yaml
- insert:
    - id: token-usage
      name: dsh-token-usage
`

### 8.2 安装命令（**实测可用，且只有这一条路**）

`powershell
$env:ELECTRON_RUN_AS_NODE = '1'
$exe = "D:\DeepSeek harness\DeepSeek Harness.exe"
$cli = "D:\DeepSeek harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js"
& $exe --expose-internals $cli plugin --profile desktop add <插件绝对路径>
`

**为什么不能用全局 `dsh`：**
1. 全局 `dsh` 是 **0.1.1-rc.2**，与运行中的 0.2.0-rc.2 不同版本，不该用它改 0.2.0 的 profile。
2. 全局 CLI 解析不了 desktop 独有的 bundle：实测 `dsh --dump-config --profile desktop` 直接失败 ——
   `dsh: cannot resolve profile bundle "@deepseek-ai/dsh-experimental-agent-team-profile" from the dsh installation or C:\Users\EDY\.dsh\profiles\desktop`
3. 桌面版 `dsh/lib/bin.js:112` 对 boot/dump 路径**无条件**拒绝 desktop：
   `function rejectElectronProfile(program, profile) {
     if (profile.toLowerCase() === "desktop") program.error("error: profile \"desktop\" is managed exclusively by the Electron application");
   }`
   但 `plugin` 子命令是**有条件**的（`bin.js:119`）：`if (!manageDesktopProfile) rejectElectronProfile(plugin, options.profile);`
   `dsh-desktop-host/lib/cli.js:93-104` 正是以 `manageDesktopProfile: true` 调用 `runCli` —— 所以**只有这条命令能合法管理 desktop profile**。

**实测结果（用一次性探针包 `dsh-token-usage-probe` 在临时 profile 上验证）：**
- `dsh: initialized profile probe at C:\Users\EDY\.dsh\profiles\probe`
- `+ dsh-token-usage-probe link:D:/个人项目/_playground/_probe-plugin` → **`link:` 依赖，改源码即时生效，不需要重装**
- profile 的 `package.json` **自动**变成：
  `json
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "dsh-token-usage-probe"] } }
  `
  → **不需要手改 profile 的任何文件**（符合原任务书的禁令）
- `--dump-config` 输出中出现：
  `yaml
  # == dsh-token-usage-probe
  - id: token-usage-probe
    name: dsh-token-usage-probe
  `
  → **bundle patch 确实被组合进树**
- 探针 profile 与探针包**已删除**，机器上只余 `desktop` / `web` / `node_modules`。

### 8.3 生效方式（**待实测，已知风险**）
新增 bundle 需要宿主重新组合 Loader 树。桌面版有 `hmr@@ 行与 `plugin-manager@@，但**新 bundle 是否会被自动接入未经实测**。若不能，需要**重启桌面应用**——而当前宿主进程正是本会话所在进程，重启会中断会话。这一条需要人工配合，见 §11.2。

---

## 9. 文件清单与职责

`
dsh-token-usage/
├── package.json            包清单；dsh.bundle.patch + dsh.client.platform + 只写下限的 compatibility
├── cordis.patch.yml        一行 insert，把 host 入口挂进 profile 树
├── lib/
│   ├── index.js            Host 半边：空 Cordis 插件（name + 空 apply）。零业务逻辑 = 零宿主版本风险
│   └── client.js           浏览器半边：单文件手写。__ModuleLoader__.load 包裹；含 CSS 常量、
│                           i18n 字典、ErrorBoundary、折叠读数组件、展开面板组件、注册逻辑
├── scripts/
│   └── check.mjs           三道门禁：① zh/en key 集合严格相等 ② 用到的每个 --dsw-* token
│                           都在 design-platform.css 里有定义 ③ 每个文件 < 262144 字节
├── test/
│   └── verify.mjs          伪 DOM + 伪 slots + 伪 locale 跑一遍 client.js：
│                           断言 factory 注册、inject 调用、未知 projection key 不抛、
│                           locale 缺失不抛、sessionId 缺失不抛、卸载后 style 被移除
├── README.md               中文说明 + 排障（slot 改名 / projection 改名时的表现）
└── README.en.md            英文
`

**v1 不引入构建步骤**（不拆 `src/client/NN-*.js`、不用 esbuild）。理由：
- 参考仓库那套拼接+压缩+字典短语打包，唯一目的是逼近 DSH STORE 的 262144 字节单文件上限；本插件预计 20–30 KB，用不上。
- 已有先例：`dsh-cline-pass` 的 `lib/client.js` 就是 113 KB 手写无构建步骤的产物。
- 减少活动部件 = 减少版本风险（服务于 §0）。

---

## 10. 验收标准

| # | 标准 | 判定 |
|---|---|---|
| A1 | 能装进 `desktop` profile | `plugin --profile desktop list` 中出现 `dsh-token-usage`，且 profile 的 `dsh.profile.bundles` 自动含它 |
| A2 | 真实界面里**看得到** | http://127.0.0.1:19387 的输入框区域出现读数（不是「注册成功」就算） |
| A3 | **能点** | 点击展开明细面板；Esc / 点外部关闭 |
| A4 | **能刷新** | 点 `[刷新]` 后「更新于」时间戳前进 |
| A5 | 中英文都正确 | 切到 English 后全部文案为英文，无 `token-usage.*` 之类裸 key 泄漏 |
| A6 | 浅色/深色都协调 | 两种主题下文字对比度足够、无硬编码色突兀 |
| A7 | 与宿主风格一致 | 字号/圆角/间距与相邻的 ContextMeter 视觉同级 |
| A8 | 宿主控制台无 error | DevTools console 无 `slot entry crashed` / 无 React warning |
| A9 | 卸载无残留 | 禁用插件后 `document.querySelectorAll('style[data-plugin]')` 中无本包；无遗留 `window.*` |
| A10 | 缺数据不报错 | 构造 projection 缺失/`sessionId` 缺失/locale 缺失三种情况，逐一确认不抛 |

---

## 11. 验证方案与边界

### 11.1 已实测（本次调研完成，可作为实现前提）

| # | 结论 | 证据 |
|---|---|---|
| V1 | 安装链路通：`plugin add` → `link:` 依赖 + 自动追加 `bundles` | 探针包实测 |
| V2 | bundle patch 被组合进树 | `--dump-config` 输出含探针行 |
| V3 | 客户端 envelope 可执行 | 在伪 `__ModuleLoader__` 中跑探针 `client.js`，得到 `{apply, inject}` |
| V4 | 平台有 per-entry 崩溃隔离；`SlotAssemblyError` 会穿透 | `dsh-client-ui-renderer/lib/client.js:601-625` |
| V5 | 未知 projection key 退化为 `undefined`，不抛 | `dsh-client-ui-renderer/lib/client.js:249-...` `source(key) ?? absentSource` |
| V6 | `slots.register` 在 slot 未声明时**抛**，`slots.inject` 不抛 | `dsh-client-ui-slots/lib/index.js:165` |
| V7 | `entry.locale` 声明但 locale face 缺失会**装配期抛** | `dsh-client-ui-renderer/lib/client.js:721-725` |
| V8 | 目标 slot 存在于当前组合 | `--dump-config --profile web` 含 `- id: ui-conversation`；slot 声明 `dsh-client-ui-conversation/lib/client.js:18329-18331` |
| V9 | `token-meter` 在组合里 | `--dump-config` 含 `- id: token-meter` |
| V10 | 主题变量存在性（含 `--dsw-radius-*` / `--dsw-elevation-*`） | `dsh-client-ui-theme/lib/client.js:1148` |
| V11 | 平台按 `data-plugin` 自动清理注入样式 | `dsh-client-modules/lib/client.js:196` |

### 11.2 **未**验证（需要真机，必须显式标注）

| # | 未验证项 | 为什么没验 | 补验方式 |
|---|---|---|---|
| U1 | 读数**真的渲染出来** | 需要宿主重载 + 看真实界面 | 重启桌面应用后在 19387 目视 |
| U2 | **新 bundle 是否被 HMR 自动接入** | 需实际安装 | 装完后不重启先看；不生效则重启 |
| U3 | 重启桌面应用的代价 | 宿主进程 = 本会话进程，重启会中断会话 | **需要人工执行并回传结果** |
| U4 | 浅色/深色实际观感 | 同上 | 切换主题目视 |
| U5 | 中英切换实际效果 | 同上 | 切语言目视 |
| U6 | 与 ContextMeter 的实际视觉同级 | 同上 | 并排目视 |
| U7 | 上游 DSH 升级后是否仍工作 | 无法预知未来 | 靠 §0 的 N1–N6 设计约束 + A10 的三种缺失构造测试 |

> 关于 U1/U3：GUI 需要认证 token（`dsh-desktop-host/lib/index.js:337` 用 `ctx.connection.authenticatedUrl(...)`），裸 HTTP 拿不到页面。可选补验路径：① 找到 token 后拉 boot manifest / 插件 bundle，确认真被下发；② Win32 截屏抓 Electron 窗口做视觉确认。两者都比「注册成功」强，但都不等于人眼确认。

---

## 12. 风险登记

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 新 bundle 需要重启宿主，而宿主是会话进程 | 无法自动完成端到端验证 | 与用户约定一个重启窗口；重启前先把静态验证全部跑完 |
| R2 | 未来 DSH 改名/移除 `conversation.composer.dock` | entry 静默消失，用户以为插件坏了 | README 排障章节写明「静默消失 = slot 变更」；`scripts/check.mjs` 不做 slot 存在性硬断言（硬断言会在升级后误报） |
| R3 | 未来 DSH 改名/移除 `tokenUsage` 投影 | 读数消失但不报错 | 属可接受降级；在面板里给出「该版本不提供用量投影」的英文兜底文案 |
| R4 | `entry.locale` 装配期抛错 | 整个 entry 装配失败 | §7.2 规则 1：条件式传入 `locale` |
| R5 | 平台变量被移除导致声明 IACVT | 圆角/阴影消失 | §6.2 方案 C：全部 `var()` 带字面量兜底 |
| R6 | 256 KiB 单文件上限 | 未来版本可能触顶 | `scripts/check.mjs` 门禁；超限时再引入构建步骤 |

---

## 13. 待确认的三个决定

1. **包名 / 插件显示名**：建议 `dsh-token-usage`，slot entry id `token-usage`，locale 命名空间 `token-usage`。
2. **主题 token 决策**：我推荐 §6.2 的**方案 C**（放宽白名单 + `var()` 字面量兜底）。若你坚持方案 A 或 B，只影响 §6，其余设计不变。
3. **是否要 `settings.section` 明细页**：我建议 **v1 不做**（该 slot 是 root 作用域，拿不到 `sessionId`，要做「当前会话」得自己遍历 `ctx.sessions.list`，且是第二块 UI 面）。留到 v1.1。
