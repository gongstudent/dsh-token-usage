# 验证记录

本文档记录 **实测过什么、怎么测的、什么没测**。未实测的部分在最后一节显式列出。

环境：DeepSeek Harness **Desktop**，打包版本 **0.2.0-rc.2**，profile `desktop`，GUI `http://127.0.0.1:19387`。

---

## 0. 一次真实事故（值得记住）

v1 交付后我直接分块重写 `lib/client.js`，写到第 1 块时文件是**语法不完整的**。用户恰好在这之后重启了应用，客户端 bundle 解析失败，插件从界面上消失。

两个结论：

1. **HMR 确实会实时接入新安装的 bundle** —— 用户在安装当时看到过 v1 的读数。这是好消息，说明安装链路与浏览器端加载都是通的。
2. **改 bundle 时必须保证 `lib/client.js` 始终是完整可用的。** 现在的流程是：候选写到 `lib/client.next.js`，用 `TU_BUNDLE` 指向它跑门禁与测试，**全部通过后才替换** `lib/client.js`。

---

## 1. 已实测

### V1 静态门禁 —— `pnpm check`

`
[ok] dictionary parity: 48 keys, identical in zh and en
[ok] token whitelist: 14 platform tokens used, all known, all with fallbacks
[ok] size bound: every file is at or under 262144 bytes
`

覆盖：中英 key 集合严格相等（含占位符集合）、样式里每个 `--dsw-*` 都在白名单内、每个 `var()` 都有字面量兜底、每个文件 ≤ 262144 字节。

### V2 行为测试 —— `pnpm test`

在伪 DOM + 伪 React + 伪 ctx 里跑**真实 bundle**，断言全绿（覆盖三个挂载面：输入框读数、侧栏卡片、设置页报表）：

`
[ok] envelope: apply/inject exported; module load has no side effects
[ok] apply: registers both seats and both disposers, silently
[ok] apply: the settings nav label tracks the host locale
[ok] apply: no locale face -> registers without a namespace, no throw
[ok] apply: no slots service -> silent no-op
[ok] apply: no ctx.effect -> silent no-op
[ok] apply: slots.register throwing -> contained
[ok] apply: a throwing service registry -> contained
[ok] apply: absent or empty context -> contained
[ok] diagnostics: sabotage is reported once each, never thrown
[ok] dock: collapsed reading shows all three buckets and the hit rate
[ok] dock: expanded panel shows occupancy, breakdown and refresh
[ok] dock: missing tokenUsage projection -> null, no throw
[ok] dock: no useProjection prop -> null, no throw
[ok] dock: partial projections degrade section by section
[ok] dock: all-zero usage -> em dash, no NaN
[ok] settings: cards, 26-week heatmap and session table all render
[ok] settings: undated sessions -> cards and table only, no calendar
[ok] settings: empty session list -> empty state, no throw
[ok] settings: no sessions service -> explanatory line, no throw
[ok] settings: malformed session snapshot -> contained
[ok] crash guard: a throwing projection is absorbed and renders nothing
`

这套测试前后抓到过两个真实缺陷：v1 里 `ctx.get('slots')` 在 try/catch 之外（服务注册表抛错时会把异常甩给宿主）；v2 里设置页导航标签没有跟随宿主语言。

### V3 安装链路

`powershell
$env:ELECTRON_RUN_AS_NODE='1'; & "D:\DeepSeek harness\DeepSeek Harness.exe" --expose-internals "D:\DeepSeek harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" plugin --profile desktop add "D:\个人项目\dsh-token-usage"
`

`
+ dsh-token-usage link:D:/个人项目/dsh-token-usage
`

profile 的 `dsh.profile.bundles` **自动**追加 `dsh-token-usage`，未手改任何 profile 文件；`dsh-cline-pass` / `dsh-models-plus` 未受影响。

### V4 桌面 profile 组合

CLI 的 `--dump-config --profile desktop` 被 `dsh/lib/bin.js:112` 无条件拒绝，改用应用自己的加载器：

`js
const { loadProfileDirectory } = require('@deepseek-ai/dsh-app-boot')
loadProfileDirectory('dsh', 'C:/Users/EDY/.dsh/profiles/desktop',
  'D:/DeepSeek harness/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh/package.json')
`

`json
{
  "packageName": "dsh-token-usage",
  "patchPaths": ["...\\dsh-token-usage\\cordis.patch.yml"],
  "patches": [{ "insert": [{ "id": "token-usage", "name": "dsh-token-usage" }] }]
}
`

`skippedBundles` 为空 ⇒ 应用下次启动不会因为这次安装失败。host 半边作为真实 ES module 加载成功（`exports = { apply, inject, name }`）。

### V5 HMR 实时接入（用户观测）

用户在应用运行期间安装后**看到了插件界面**，未重启。⇒ 新增 bundle 会被 HMR 实时组合并加载，不必重启。

### V6 上游机制核对（设计依据）

| 结论 | 证据 |
|---|---|
| 平台有 per-entry 崩溃隔离；`SlotAssemblyError` 会穿透 | `dsh-client-ui-renderer/lib/client.js:601-625` |
| 未知 projection key 退化为 `undefined`，不抛 | `dsh-client-ui-renderer/lib/client.js:249` `source(key) ?? absentSource` |
| `slots.register` 在 slot 未声明时**抛**；`slots.inject` 不抛 | `dsh-client-ui-slots/lib/index.js:165` |
| `entry.locale` 声明但 locale face 缺失会**装配期抛** | `dsh-client-ui-renderer/lib/client.js:721-725` |
| 两个目标 seat 都在组合内 | `ui-conversation` / `ui-settings-general` 在层列表内 |
| `token-meter` 在组合内 | 层列表含 `- id: token-meter` |
| 主题变量存在（含 `--dsw-radius-xs/md`、`--dsw-elevation-panel`） | `dsh-client-ui-theme/lib/client.js:1148` |
| 平台按 `data-plugin` 清理注入样式 | `dsh-client-modules/lib/client.js:196` |
| `dsh.profile.bundles` 变化会触发重组 | `dsh-hmr/README.md:57` |
| 会话头有 `createdAt` | `dsh-session/lib/index.js:1043` |
| 会话摘要带 `modelSelection.lastUsed.{provider,model}` | `dsh-api-remotes/lib/client.js:10160-10171` |
| 会话摘要带 `sessionListMetadata.{blank,lastPromptAt}` | `dsh-api-remotes/lib/client.js:10143-10146` |
| `sessionStats` 投影只有 turns/steps/耗时,**没有**模型或分模型用量 | `dsh-session-stats/lib/types/projection.js:27-36` |

---

## 2. **未**实测（需要真机，必须显式声明）

| # | 未验证项 | 为什么 |
|---|---|---|
| U1 | 两个挂载面的**视觉呈现** | 需要人眼看真实界面 |
| U2 | 热图是否真的取到了会话时间戳 | 会话摘要的时间戳字段名无法从静态代码确认；探不到时热图会整块不渲染（有测试覆盖该降级路径，但真实数据走哪条分支未验） |
| U3 | 浅色 / 深色实际观感 | 同上 |
| U4 | 中英切换实际效果 | 同上 |
| U5 | 与宿主相邻控件的视觉同级 | 同上 |
| U6 | 上游 DSH 升级后是否仍工作 | 无法预知；靠设计约束 + V2 的缺失构造测试兜底 |

**为什么 U1–U5 没做**：桌面版 GUI 需要进程内随机 token（`dsh-client-connection/lib/index.js:244` `processLaunchToken` 用 `randomBytes` 存在 WeakMap，不落盘），裸 HTTP 拿不到页面；插件 bundle 走 **shell carrier**，HTTP `/plugins` 路由没挂载——实测 `/plugins`、`/plugins/dsh-cline-pass/client.js?rev=1` 全 404，而 `/@@ 是 401。**没有非视觉的验证通道。**

---

## 3. 真机验证步骤

1. 打开任意会话，看输入框那一行、宿主上下文环左边：应有 `▮▮▮ 输入 … · 缓存 … · 输出 … · 命中 …%`。
   - 该会话还没产生用量时读数不显示，这是**预期**（没有 `tokenUsage` 数据时渲染 `null`）。
2. 点它 → 展开面板；`Esc@@ / 点外部关闭；`[刷新]` 推进时间戳。
3. 打开 **设置** → 导航里应有「Token 用量」；页内应有三张卡片、26 周热图、会话表。
4. 切英文 / 切深色主题，确认文案与配色。
5. DevTools Console 确认没有 `slot entry crashed`、没有 `[dsh-token-usage]` 诊断。

### 如果设置页没有热图

大概率是 **U2**：会话摘要上没有可识别的时间戳字段。卡片和会话表会正常显示。这时把 `C:\Users\EDY\.dsh\sessions` 里某个会话摘要的实际字段名告诉我，我调整探测顺序。

### 如果完全看不到

1. 确认是**静默降级**：Console 里没有 `[dsh-token-usage]` 诊断、没有 `slot entry crashed`。
2. `cd D:\个人项目\dsh-token-usage; pnpm test` 确认包本身没坏。
3. 完全退出应用（含托盘）再打开。
4. 重跑 V4 的 `loadProfileDirectory` 脚本，看 `layers` 里有没有 `dsh-token-usage`。

### 卸载

`powershell
$env:ELECTRON_RUN_AS_NODE='1'; & "D:\DeepSeek harness\DeepSeek Harness.exe" --expose-internals "D:\DeepSeek harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" plugin --profile desktop remove dsh-token-usage
`
