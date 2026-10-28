# dsh-ketcher · Ketcher 化学分子式编辑器（DSH 插件）

在 DSH Web UI 的消息输入框上方增加一个可展开的 **Ketcher 分子结构编辑器**：
画/改结构后，一键把 **SMILES** 或 **molfile** 插入输入框；同时给 Agent 一个
`ketcher_analyze_smiles` 工具，用于校验 SMILES 并估算分子式。

本插件遵循 DSH 官方《cordis-plugin-development》规范：UI 是注册到真实 slot 的
React 组件（不用 iframe），资源全部同源、可离线，Host 代码零外部依赖。

---

## 一、插件结构

```
dsh-ketcher/
├─ package.json          # bundle 清单：dsh.bundle.patch + dsh.client
├─ cordis.patch.yml      # 插入一行 id=ketcher 的插件
├─ index.js              # Host：静态资源托管 + 就绪探针 + Agent 工具
├─ src/chem.js           # 零依赖 SMILES 解析 / 分子式估算 / 校验
├─ client.js             # Client：__ModuleLoader__ 工厂，注册 composer.dock 面板
├─ locale/{zh,en}.json   # 显示元数据（标题/描述）
├─ icon.svg              # 原创矢量图标
├─ vendor/               # 构建产物（ketcher-app.js + 静态资源），默认不提交
└─ scripts/
   ├─ build-vendor.mjs   # 生成 vendor/（唯一的重活）
   └─ install.mjs        # 非 Electron profile 的安装/回滚脚本
```

### 两个半区职责

| 半区 | 文件 | 作用 |
|---|---|---|
| Host | `index.js` | 在 `webServer` 上注册 `prefix /ketcher-assets`（托管 Ketcher 预构建资源）与 `exact /ketcher-api/ready`（资源是否已构建）；用 `ctx.tools.register` 注册 `ketcher_analyze_smiles`。 |
| Client | `client.js` | 以 `window.__ModuleLoader__.load({ id, factory })` 形式加载；在 `conversation.composer.dock` 注册一个面板组件。展开时懒加载 `vendor/ketcher-app.js`（暴露 `window.Ketcher`），用 `onInit` 拿到 ketcher 实例，通过 slot props 的 `inputActions.insertText(text, span)` 把结构写入输入框。 |

### 为什么不用 iframe / CDN

- DSH 插件规范明确：插件 UI 必须是 slot 里的 React 组件，**不要**从 Host 提供 HTML 页面塞进 iframe（会丢失主题 token、明暗切换、locale）。
- 因此在页面里直接挂载 Ketcher 的 React `Editor`；其重型运行时由**本插件自己的 Host 路由**同源托管，避免第三方网络依赖，也便于离线。

---

## 二、安装

### 方式 A（推荐）：应用内安装

DSH 的 `desktop` profile 由 Electron 应用独占管理。请在 **Plugins 页面**安装本目录，
或让 Agent 调用 `plugin_manager`：

```jsonc
{ "action": "install_bundle", "target": "D:\\化学agent\\dsh-ketcher" }
```

安装结果看返回的 `application`（`applied` 才代表已生效）与 `warnings`。

### 方式 B：非 Electron / 独立 profile

```powershell
node D:\化学agent\dsh-ketcher\scripts\install.mjs --profile <profile> --dry-run   # 先看计划
node D:\化学agent\dsh-ketcher\scripts\install.mjs --profile <profile>             # 执行（会备份 package.json）
cd $env:DSH_HOME\profiles\<profile>; pnpm install
```
脚本拒绝在运行中的 `desktop` profile 上直接改盘（除非 `--force` 且应用已关闭），
并打印回滚命令。

---

## 三、生成 Ketcher 运行时（vendor/）

插件安装后即挂载，但**绘制面板需要** `vendor/ketcher-app.js`。生成它：

```powershell
cd D:\化学agent\dsh-ketcher
npm install --no-save ketcher-core ketcher-react ketcher-standalone react react-dom esbuild
node scripts/build-vendor.mjs
```

脚本会用 esbuild 把 `ketcher-react` 的 `Editor` + `ketcher-standalone` 的本地 Indigo 引擎
打成单一 IIFE，导出 `window.Ketcher.mount(container, { staticResourcesUrl, onInit })`，
并把 WASM/字体/模板复制到 `vendor/static/`。在此之前，面板会显示
「Ketcher 资源未就绪」提示而不会报错。

> 说明：这一步需要联网与较大体积（Ketcher + Indigo WASM 约数十 MB）。本次交付已完成
> 全部代码、构建与安装脚本，但未在本机执行这次重型构建；按上面两条命令即可生成。

---

## 四、Agent 工具：`ketcher_analyze_smiles`

参数：`{ smiles: string }`
返回：`{ valid, atomCount, formula, error }`

示例（已实测）：

| SMILES | 结果 |
|---|---|
| `CCO` | valid, 3 原子, **C2H6O** |
| `c1ccccc1` | valid, 6 原子, **C6H6** |
| `CC(=O)Oc1ccccc1C(=O)O`（阿司匹林） | valid, 13 原子, **C9H8O4** |
| `not-a-smiles` | invalid（报错位置） |

范围说明：只做**中性有机分子**的分子式估算与语法校验；不做立体化学感知、不做
SMILES↔molfile 转换（后者由浏览器内 Ketcher 的 Indigo 完成，画完点「插入 molfile」）。

---

## 五、验证状态

| 项 | 状态 |
|---|---|
| 所有 JS 语法（`node --check`） | ✅ 通过 |
| `package.json` / locale JSON 解析 | ✅ 通过 |
| Host `apply()` mock 集成（路由/工具注册、工具执行） | ✅ 通过（`node scripts/test-host.mjs`） |
| Client 模块 `__ModuleLoader__` 加载 + slot 注册 + 组件渲染 | ✅ 通过（`node scripts/test-client.mjs`） |
| Ketcher 真实渲染（需浏览器 + vendor 构建） | ⏳ 未验证（需在应用内安装并构建 vendor 后目视确认） |
| 已安装到 desktop profile | ⏳ 未执行（该 profile 由 Electron 应用独占，须经应用内 Plugins 页面/`plugin_manager` 安装） |
