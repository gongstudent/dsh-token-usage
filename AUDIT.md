# 插件合规与版本健壮性自查

审查对象：`dsh-token-usage` @ `D:\个人项目\dsh-token-usage`
运行环境：DeepSeek Harness Desktop **0.2.0-rc.2**，profile `desktop`
结论：**符合插件契约；没有会被版本门槛拦下的依赖；剩余失效模式全部是「静默降级」而非崩溃。**

---

## 1. 包契约合规（对照加载器自己的校验代码）

| 要求 | 现状 | 依据 |
|---|---|---|
| 声明 profile 补丁 | `dsh.bundle.patch = "./cordis.patch.yml"`，文件里是一行 `insert` | `dsh plugin add` 的 `reconcilePlugins()` 靠它把包加进 `dsh.profile.bundles` |
| 声明客户端半边 | `dsh.client.platform = "web"`（desktop 也用 `"web"`） | 同 profile 里在用的 `dsh-cline-pass` 即如此 |
| 有可加载的 host 入口 | `lib/index.js` 导出 `name/inject/apply`，是合法的空 Cordis 插件 | 实测 `loadProfileDirectory` 组合成功、host 半边作为 ES module 加载成功 |
| 客户端 bundle 信封 | `window.__ModuleLoader__.load({ id, factory })`，factory 返回 `{ apply, inject }` | `dsh-client-modules` 的加载契约 |
| 只 require 平台种子 | **只 require 了 `'react'`**，全 bundle `@deepseek-ai` 出现 **0 次** | `react` 在 `dsh-web-frontend/dist/assets/index-5SrrfWpU.js:126` 的种子表里，无需 `dsh.client.external` |
| 无会锁版本的 peer | **`peerDependencies` 为空** | 见 §2 |

### 为什么「无 peerDependencies」是刻意的

DSH 加载期**唯一**的兼容性门槛是 `evaluatePluginCompatibility`（`dsh-app-boot/lib/index.js:286`）：

`js
const fields = objectOf$1(manifest, "Plugin manifest");
if (!Object.hasOwn(fields, "peerDependencies")) return void 0;   // ← 没有 peer 就直接放行
const dependencies = objectOf$1(fields.peerDependencies, "Plugin manifest peerDependencies");
for (const [name, range] of Object.entries(dependencies)) {
  if (name !== "@deepseek-ai/dsh" && !name.startsWith("@deepseek-ai/dsh-")) continue;
  ...评估 range 与运行时版本
}
`

它只检查名字是 `@deepseek-ai/dsh` 或 `@deepseek-ai/dsh-*` 的 **peerDependencies**。

本插件在 Node 侧**不 import 任何宿主包**（host 半边是空插件），所以一个 peer 都不该声明 —— 而正好，**没有 peer 就等于没有版本门槛，任何未来的 DSH 版本都不会因为兼容性检查而拒绝加载它。**

反过来，`dsh.compatibility` 字段（我写了 `">=0.1.0-rc.5"`，无上界）**不是加载门槛**：`readProfileCompatibility`（`dsh-app-boot/lib/index.js:359`）读的是 **profile 级**的 `compatibility.json`（常量在 `:328`），而 `C:\Users\EDY\.dsh\profiles\desktop` 下**根本没有这个文件**；它产出的也只是 `warnings`（`dsh/lib/plugin-BGnVfe_D.js:73`）。所以那个字段只是给插件管理器和 dshhub 看的元数据。

---

## 2. 宿主 API 依赖清单与失效行为

全 bundle 实际触到的宿主面（脚本枚举，非目测）：

| 依赖 | 用法 | 失效时会发生什么 |
|---|---|---|
| `window.__ModuleLoader__.load` | 模块信封 | 插件不加载（页面无反应），不会报错到别处 |
| `require('react')` | 平台种子 | 同上 |
| `ctx.get('slots')` + `slots.inject` / `slots.register` | 注册三个挂载面 | `inject` 对未声明的 slot 只是永不执行 → **静默不出现**。`register` 抛错已被 try/catch 吞掉并记诊断 |
| slot key：`conversation.composer.dock` / `sidebar.footer.action` / `settings.section` | 选址 | 被改名 → 该面静默消失，其他面不受影响 |
| `ctx.get('locale')` + `register(NS,{zh,en})` | 词条 | 服务缺失 → 不声明 `locale`，组件回落到内置 `fallbackT`（按 `navigator.language`），文案仍是完整的中英 |
| `locale.getSnapshot().active` | 导航标签语言 | 读不到 → 回落到 `navigator.language` |
| `ctx.get('sessions')` + `list.subscribe` / `getSnapshot` | 跨会话汇总 | 服务缺失 → 设置页退化成一行说明；subscribe 抛错或返回非函数 → 已被包成惰性订阅（见 §3.3） |
| `ctx.effect` | 样式表 / 词条 disposer | 不存在 → 跳过注册 disposer，样式仍由平台按 `data-plugin` 在 teardown 时清掉 |
| `props.useProjection('tokenUsage' \| 'contextPressure' \| 'contextBreakdown' \| 'modelSelection')` | 全部读数 | key 被改名 → 返回 `undefined`（渲染器里是 `source(key) ?? absentSource`，`dsh-client-ui-renderer/lib/client.js:249`）→ dock 返回 `null`，其余段落逐块省略 |
| `props.t` | 文案 | 缺失 → 用内置 `fallbackT` |
| 会话摘要字段：`projectionValues.tokenUsage` / `.modelSelection.lastUsed.model` / `.sessionListMetadata.lastPromptAt` | 聚合 | 逐个字段多拼写探测；探不到 → 总量照算，只是不画热图 / 模型列显示破折号 |
| `document.head.appendChild` / `querySelector` / `createElement` | 样式注入 | 标准 DOM，无风险 |
| `:has()`（仅一条 CSS） | 藏掉宿主导航齿轮 | 不支持 → 齿轮与自绘图标并排（纯外观） |
| `color-mix()`（仅 1 处，装饰） | 侧栏卡片渐变 | 不支持 → 前一条纯色 `background` 生效 |

**语法层面**：bundle 里可选链 `?.` **0 处**、空值合并 `??` **0 处**，全部用 `== null` 与显式分支，不依赖较新的语法糖。

---

## 3. 本轮自查发现并修掉的问题

### 3.1 color-mix 承载了信息（严重）
热图四档色阶和侧栏柱子原本用 `color-mix()` 算透明度。`color-mix()` 是 Chromium 111+ 才有；不支持时**整条声明失效** → 四档全部退化成同一个颜色，**用量强弱就看不出来了**。

改为 `opacity` / `fill-opacity` + 实心品牌色，SVG 的 `fill-opacity` 是 SVG 1.1，没有任何兼容风险。现在 `color-mix` 只剩 1 处纯装饰的渐变，并且前面有一条纯色 `background` 兜底。

### 3.2 淡化与色阶的 opacity 互相覆盖（中等）
`.tu-cell.muted` 原本也写 `opacity:.3`，和 `.tu-cell.l1` 的 `opacity:.3` 相同 → 范围外的 l1 格子看起来和范围内的一样。改为 `filter:opacity(.38)`，与 `opacity` **相乘**，淡化才真的淡。

### 3.3 subscribe 返回值未防御（中等）
`useSyncExternalStore` 会在清理阶段调用 subscribe 的返回值。宿主若返回非函数，React 清理时抛 TypeError。现在包了 try/catch 并断言返回值是函数，否则用惰性 `noopSubscribe()`。测试里的伪 React 现在**会真的调用**那个返回值，所以这条防线是被实测覆盖的。

### 3.4 导航标签回调可能把异常抛进宿主的设置树（中等）
`settings.section` 的 `label` 是**宿主在构建自己设置页时调用**的函数。它一旦抛错，坏的是宿主的页面，不是我的。现在整个函数体包了 try/catch，失败时返回纯文本。

### 3.5 `tag.remove()` 未判类型（轻微）
已加 `typeof tag.remove === 'function'`。

### 3.6 侧栏卡片边框的 color-mix 没有兜底（轻微）
`border:1px solid color-mix(...)` 在不支持时**整条 border 失效**（连边框都没了）。改为先用主题边框 token，蓝色强调改由 `border-top` 实心承担。

### 3.7（上一轮）删词条漏删引用
会话表里残留 `t('costUnpriced')`，界面直接显示裸 key。已修，并补了一道门禁：**bundle 里 `t('key')` 引用的每个 key 必须在两张字典里存在**。已用「故意注入该缺陷」验证门禁会失败。

---

## 4. 原任务书硬性约束逐条核对

| 约束 | 结果 |
|---|---|
| 样式只用 `--dsw-alias-*` / `--dsw-static-*` | ⚠️ **一处经你批准的偏离**：另用了 `--dsw-radius-xs/md`、`--dsw-elevation-panel`（几何变量，平台自己也在用）。当时你选了「方案 C：放宽白名单 + 每个 `var()` 带字面量兜底」，门禁强制检查兜底。颜色**只**用 alias/static |
| 不 import 任何 Harness Client 包 | ✅ 全 bundle `@deepseek-ai` 出现 0 次，只 require `react` |
| 文案走 `ctx.locale.register(NS, {zh,en})`，中英 key 一致 | ✅ 48 key 严格对等（含占位符集合），门禁强制 |
| 不写宿主 DOM / 不 `document.body.appendChild` / 不用 iframe | ✅ 只在 `document.head` 注入一个带 `data-plugin` 的 `<style>`；无 portal、无 iframe |
| 注册与资源在 `ctx.effect` / slot 生命周期成对清理 | ✅ 样式表与词条各有 disposer；slot disposer 由 `slots.register` 返回并交给 slot 引擎 |
| 不手改 profile 的 package.json / cordis.patch.yml | ✅ 全程用 Desktop CLI |
| 不整包移植参考仓库 | ✅ 零代码复用，只借形态与口径 |

---

## 5. 仍然存在的风险（诚实列出，均不会崩溃）

| # | 风险 | 症状 | 已做的缓解 |
|---|---|---|---|
| R1 | 宿主把 `label` 的返回值强制转成字符串 | 导航项显示 `[object Object]` | 无法从插件侧阻止；try/catch 只覆盖抛错。**症状已记录在案**，一旦出现改成纯文本 + 放弃自绘图标即可 |
| R2 | `getSnapshot()` 每次返回新对象 | React 可能反复渲染 | 未防御（成本高）。当前宿主返回的是稳定 store 快照 |
| R3 | `:has()` 不被支持 | 导航齿轮与自绘图标并排 | 纯外观，无功能损失 |
| R4 | composer 处于带 `transform` 的祖先内 | dock 面板定位偏移 | `position:fixed` + 实时测量，参考仓库同样做法 |
| R5 | 会话摘要字段再改名 | 热图消失 / 模型列破折号 | 多拼写探测；总量永远照算 |
| R6 | slot key 或 projection key 被改名 | 对应面静默消失 | **这是设计目标**（不报错）；README 排障章节写明 |
| R7 | 宿主未来支持给 section 配图标 | 我的自绘图标多余 | 届时去掉 `navGlyph` 与那条 `:has()` 即可 |

---

## 6. 门禁现状

`pnpm check` 六道：

`
[ok] dictionary parity: 48 keys, identical in zh and en
[ok] token whitelist: 14 platform tokens used, all known, all with fallbacks
[ok] message keys: 42 referenced, all declared in both locales
[ok] audit invariants: color-mix stays decorative, intensity is opacity-based
[ok] package contract: no version-gating peers, bundle patch and client platform declared
[ok] size bound: every file is at or under 262144 bytes
`

`pnpm test` 33 条行为断言，覆盖三个挂载面与九种宿主设施缺失/损坏的情形。

---

## 7. 两处启动顺序缺陷（已修，代价最大的一条）

**症状**：插件在 HMR 状态下一切正常，但**每次完整重启后界面上什么都没有**，而且控制台一声不响。

### 7.1 `slots` 服务在开机时还不存在

`exports.inject = []` 的含义是「我不依赖任何服务」，客户端 Loader 于是**立刻**调用 `apply()`。
但那一刻渲染器**还没有提供 `slots` 服务**，于是这行防御代码直接返回：

`js
const slots = ctx.get('slots')
if (slots == null || typeof slots.inject !== 'function') return   // 开机时从这里返回
`

三个挂载面一个都没注册。HMR 时页面早已启动完毕、服务就绪，所以每次都正常 —— 这就是「热更新好用、重启就消失」的全部原因。

实测证据（从渲染器的 localStorage 读出）：

`
修复前   seat.apply.slots -> MISSING service   （随后三个 seat 全无）
修复后   seat.apply.slots -> present with inject()
         seat.inject.fired.{dock,sidebar,section} -> fired
`

**修法**：`exports.inject = ['slots']` —— 让 Cordis 等到服务就绪再 apply，服务若被替换还会重新 apply。

### 7.2 `sessions` 服务同理，而且不能拖累输入框读数

侧栏卡片和设置页还需要客户端会话列表，它在开机时同样还没到。但**输入框读数根本不需要它**，
所以不能简单地把 `sessions` 也塞进 `inject`（那样一旦该服务在未来的版本里改名，输入框读数会跟着一起消失）。

改成**按依赖拆开注册**：

`js
exports.inject = ['slots']        // 输入框读数只需要 slot 注册表
seat(DOCK_SLOT, ...)              // 立刻注册

ctx.inject(['sessions'], (sessionCtx) => {   // 侧栏 / 设置页等它就绪
  seat(SIDEBAR_SLOT, ..., sessionCtx.sessions, ...)
  seat(SECTION_SLOT,  ..., sessionCtx.sessions, ...)
})
`

测试锁死了这条：**会话列表永不到达时，仍然有且只有 composer 那一个面注册成功**。

### 7.3 教训

两处是**同一类**缺陷：`ctx.get(service)` 在开机那一刻拿不到渲染器稍后才提供的服务，
而防御分支把「服务缺失」当成了正常情况**静默吞掉**。

> **防御性静默降级会掩盖真实的启动顺序问题。**
> 服务依赖应当**声明**（`inject`）让框架负责等待，而不是自己 `get` 一下拿不到就退出。
> 静默降级只应该用于「功能可选」的场景，不能用于「功能必需但时机未到」。

门禁已加固：`scripts/check.mjs` 断言 bundle 必须声明 `slots` 依赖、且跨会话面必须走 `ctx.inject(['sessions'])`。

### 7.4 排查手法（值得复用）

桌面端没有任何非视觉的验证通道（GUI 要进程内随机 token，插件 bundle 走 shell carrier 而非 HTTP），
所以最终靠的是**把探针写进 localStorage，再直接读渲染器的 LevelDB 文件**：

`
C:\Users\EDY\AppData\Roaming\@deepseek-ai\dsh-desktop\Local Storage\leveldb\*.log
`

配合一个**与目标 profile 完全同构的镜像 profile**（同样的 bundles 列表、junction 同一份 node_modules），
用应用自己的 host 启动，就能在不碰真实环境的前提下复现开机路径、并验证开机模块图的内容。
