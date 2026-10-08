# AGENTS.md — dsh-token-usage

给在这个仓库里干活的 AI 助手的须知。**动手前先读这份**，它记录的每一条都是踩过坑的。

## 这是什么

DeepSeek Harness 的 token 用量查看器。三个挂载面：输入框读数、侧栏卡片、设置页报表。
只读、无持久化、**宿主半边是空插件**、不 import 任何 Harness Client 包。

## 硬性约束（改动时不能破坏）

| 约束 | 为什么 |
|---|---|
| `exports.inject = ['slots']` | **不能改成 `[]`**。空依赖 = 立即 apply，而开机那一刻渲染器还没提供 `slots` → 什么都没注册，界面全空且控制台无声。详见 `AUDIT.md` §7 |
| 跨会话面走 `ctx.inject(['sessions'], …)` | 同理。**不要**把 `sessions` 塞进 `exports.inject` —— 输入框读数不需要它，塞进去会让它陪绑 |
| 用 `slots.inject`，不用 `slots.register` | 后者在 slot 未声明时**抛错** |
| 只有 locale 服务存在时才在 slot options 里写 `locale` | 声明了但 locale face 缺失会在**装配期**抛 `SlotAssemblyError`，装配错会穿透平台的 entry 隔离 |
| 每个 `var(--dsw-*)` 必须带字面量兜底 | 变量被移除时 `var()` 不回落，整条声明失效（IACVT） |
| 颜色只用 `--dsw-alias-*` / `--dsw-static-*` | alias 有浅/深两套定义，硬编码必然在某个主题下不对 |
| 中英 key 集合必须严格相等 | 门禁强制 |
| 不 import `@deepseek-ai/*` | 只 `require('react')`（平台种子表） |
| 不写宿主 DOM、不 portal 到 body、不用 iframe | 只在 `document.head` 注入带 `data-plugin` 的 `<style>` |

## 改代码的流程（重要）

**绝对不要**直接分块写 `lib/client.js` —— 写到一半文件是语法不完整的，此时若 HMR 或重启读到它，插件直接消失，而且极难定位（已经因此损失过四轮重启）。

正确流程：

`bash
# 1. 候选写到独立文件
#    （或先 cp lib/client.js lib/client.next.js 再改）
$env:TU_BUNDLE='lib/client.next.js'
node scripts/check.mjs
node test/verify.mjs
# 2. 全绿后才替换
Copy-Item lib/client.next.js lib/client.js
`

## 验证

`bash
pnpm test         # 7 道门禁 + 33 条行为断言
pnpm check        # 只跑门禁
pnpm sync-tokens  # 从本机 DSH 重新生成主题 token 白名单
`

**门禁是活的，不要为了通过而放宽它们。** 每一条都对应一个真实缺陷：
中英 key 对等、主题 token 存在且有兜底、`t('key')` 引用必须已声明（曾把裸 key 显示到界面上）、
`color-mix` 只能用于装饰（曾承载色阶信息）、启动顺序、无版本门槛 peer、文件大小。

## 装机与调试

安装**必须**用 Desktop 自带 CLI（全局 `dsh` 管不了 `desktop` profile），命令见 `README.md`。

**桌面端没有非视觉的验证通道**：GUI 要进程内随机 token，插件 bundle 走 shell carrier 而非 HTTP
（`/plugins` 在桌面端连内置 bundle 都 404；真实的组合路由是 `/plugins/??<pkg>/client.js&rev=…`）。

调试客户端插件时，可复用的手法是**把探针写进 localStorage，再直接读渲染器的 LevelDB**：

`
C:\Users\EDY\AppData\Roaming\@deepseek-ai\dsh-desktop\Local Storage\leveldb\*.log
`

配合**与目标 profile 完全同构的镜像 profile**（同样的 bundles 列表 + junction 同一份 node_modules），
用应用自己的 host 启动，就能在不碰真实环境的前提下复现开机路径、检查开机模块图。

**探针用完必须删干净**，并确认 `markSeat|localStorage|TEMPORARY` 残留为 0。

## 别做的事

- 不要手改 profile 的 `package.json` 或 `cordis.patch.yml`（用 CLI）
- 不要把参考仓库 `dsh-cost-meter` 的 token 词表照抄过来（它跨版本累积，有 5 个 token 在当前版本不存在）
- 不要用 `D:\个人项目\deepseek-harness` 当 API 依据（那是 0.1.0-rc.5 的旧 checkout，运行中的是 app.asar 里的 0.2.0-rc.2）
- 不要在没有真机确认的情况下宣称「界面正常」
