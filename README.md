# 交付物面板（Deliverables panel）

右侧栏插件：把**当前会话的最终交付物**集中列出来。过程中产生的过程文件、临时文件、脚本文件一律不展示。

## 安装

```sh
# 从 GitHub 安装
dsh plugin --profile <profile> add github:xuanbing2241/dsh-deliverables-panel
# 或从 npm 安装
dsh plugin --profile <profile> add dsh-deliverables-panel
```

桌面端也可以走 **设置 → 插件 → 添加插件**，填包名或者指向本机目录。
装完刷新一次页面（浏览器端模块在页面加载时装配）。

- npm：[dsh-deliverables-panel](https://www.npmjs.com/package/dsh-deliverables-panel)（当前 `1.0.0`）
- GitHub：[xuanbing2241/dsh-deliverables-panel](https://github.com/xuanbing2241/dsh-deliverables-panel)

**环境**：在 DSH `0.2.2-rc.5`（Desktop，Windows 11）上实测。包内没有声明 `engines.dsh`，所以市场的兼容列会显示 unknown，而不是一个我没验证过的版本范围。

## 入口在哪

右侧栏 → 起始页（标签栏的 `＋`，或展开右侧栏）→「**交付物**」卡片。
点开后是当前会话的交付物清单：点任意一行在右侧栏打开该文件，行尾可复制完整路径，右上是刷新；面板在屏时每 4 秒自动重读。

## 显示什么

交付物有两个来源，走**两套**规则：

1. **已声明交付** —— 模型用 `present` 工具声明过的文件（会话日志里的 `deliverables/presented` 事件）；
2. **本会话产出** —— 模型用 `write` / `edit` / `str_replace_editor` 成功写入的文件。

两类共用的硬规则（任何来源都拦）：

| 规则 | 说明 |
| --- | --- |
| 不在临时目录里 | 目录名归一化（去掉前导 `.` / `_`）后命中 `tmp`、`temp`、`node_modules`、`git`、`cache`、`pycache`、`pytest_cache`、`venv`、`idea`、`vscode`、`dsh-tmp` —— 所以 `_tmp/`、`.cache/`、`__pycache__/` 都会被拦下 |
| 不是锁 / 日志 / 备份 / 半成品 | 名字以 `~$` 或 `.` 开头；或以 `.tmp` `.temp` `.bak` `.backup` `.log` `.part` `.crdownload` `.swp` `.cache` `.orig` `.rej` `.lock` 结尾 |

**已声明交付**：除上面两条外，只再过一道**脚本类型黑名单** —— `py / pyc / ipynb / ps1 / psm1 / sh / bash / zsh / bat / cmd / js / mjs / cjs / ts / tsx / jsx / vbs / pl / rb / lua / php / go / rs / java / cs / c / cpp / h / hpp / swift / kt / scala / gradle / mk` 等一律不显示（这就是「脚本文件一律不展示」），其余任何类型都显示（含 `html`、`json`、`svg` 这类工具产出物，模型声明了它，它就出现）。

**本会话产出**：必须命中**交付物类型白名单**，且名字不能像生成物 —— 白名单是 `md / markdown / txt / rtf / pdf / epub / eml / msg`、`doc(x) / xls(x|m) / csv / tsv / ppt(x) / odt / ods / odp`、`sql`、`png / jpg / jpeg / gif / webp / bmp / tif(f)`、`zip / 7z / rar / tar / gz / mp4 / mov / mp3 / wav`；名字以 `_` 开头、或含 `probe / debug / dbg / scratch / untitled / guard / playground / tmp / package-lock / -copy / (1)` 的，都按过程文件隐藏。

所以 `_部署_xxx.sql` 这种以下划线开头的成品：**声明过就显示**（走「已声明」规则），**只是被写入过就隐藏**（走「本会话产出」规则）。

页脚会写「另有 N 个过程 / 临时 / 脚本文件未列出」，N 是这次被过滤器拦下的去重文件数——看得见过滤生效，但看不到那些文件的路径。

## 行为细节

- 清单由 Host 半从**会话日志**读取（`deliverables/presented` 事件 + `tool/call`/`tool/result` 里的写入目标），不上传、不读写任何交付物文件本身。
- 面板 body 注册为 `keepMounted`：切走再切回**不重载、不丢滚动位置**；面板不可见时轮询自动停。
- Host 用会话日志的 cursor 做失效键：没有新事件时直接回缓存（不扫描日志）；有变化时只重算一次。
- 单次最多返回最近 200 条；被截断时列表末尾会说明。
- 右侧栏地址用宿主的 `dsh-resource://file/session/<会话>/<工作区相对路径>` 形态：工作区内的文件与聊天里的文件链接指向**同一个标签**（不会开两份），工作区外的文件保留绝对路径。
- 打开动作有兜底：地址无人认领时面板底部提示「暂时无法在侧栏打开，路径可复制」，复制失败也有提示。
- 文案走 `deliverablesPanel` 语言命名空间（中文 / English 两套）。

## 想改过滤规则

规则集中在 `index.js` 顶部的常量里，改完重启（或等 HMR 重组）生效：

- `DELIVERABLE_TYPES` —— 「本会话产出」的类型白名单；
- `SCRIPT_TYPES` —— 任何来源都不显示的脚本类型；
- `PROCESS_DIRECTORIES` —— 临时目录名（写归一化后的名字，即不带前导 `.`/`_`）；
- `PROCESS_NAME_PREFIXES` / `PROCESS_NAME_PREFIXES_PRODUCED` / `PROCESS_NAME_SUFFIXES` —— 名字前后缀；
- `TOOLING_NAME_WORDS` —— 「本会话产出」的工具脚本特征词；
- `MAX_FILES` —— 单次返回上限。

## 已知边界

- 只认 `present` 与第一方写文件工具；`bash` 里用重定向生成的文件不会自己冒出来（要它出现就 `present` 一下）。
- 轮询间隔 4 秒，刚交付的文件最多晚 4 秒出现；点刷新立即重读。
- 入口卡片画在右侧栏起始页里；起始页若被别的插件接管（例如 `dsh-better-sidebar`），卡片由那个页面按 `sidebarRightTabs` 注册表渲染，本插件只贡献卡片本身。
- 打开文件由右侧栏的标签类型决定：本机装了 `dsh-better-sidebar` 时，`.md / .sql / .txt / .zip` 会开它的编辑器页，`png / xlsx / docx / pdf` 走内置预览。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 半：`/api/deliverables-panel.list` 路由、会话日志折叠、过滤器 |
| `client.js` | 浏览器半：标签类型、起始页入口卡片、面板 UI |
| `cordis.patch.yml` | bundle 的装载行（`id: deliverables-panel`） |
| `locale/*.json` | 插件管理页的标题 / 说明 / 详情图 |
| `docs/` | 详情页文档与预览图 |
| `assets/icon-180.png` | 市场卡片图标（GitHub 托管的位图） |
| `submission/` | 市场收录条目的 YAML 与 PR 文本（不随包发布） |