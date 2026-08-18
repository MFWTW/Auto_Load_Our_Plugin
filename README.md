# dsh-workflow-loader

DeepSeek Harness（DSH）**文件夹工作流自动加载器**：让每个工作文件夹自带的 `.dsh/workflows/*.mjs` 在会话开始时自动加载，把文件夹变成"自带工作流"的工作区。配套提供**设置中的「工作流」列表页**。

插件按官方开发文档格式编写（见 [第一个插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/)、[开发一个 Tool](https://deepseek-harness.github.io/deepseek-harness/develop/basic/tool)、[插件配置](https://deepseek-harness.github.io/deepseek-harness/develop/basic/config)、[打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)）。

## 仓库内容

| 路径 | 形态 | 作用 |
| --- | --- | --- |
| `dsh-workflow-loader/` | 组合包（bundle） | 工作流自动加载器（宿主侧：任何预设的会话打开文件夹即自动加载） |
| `workflows/mcm-workflow.mjs` | 工作流文件 | 示例：数学建模六阶段流程工具 `mcm_stage_guide` |
| `dsh-workflow-registry/` | 组合包（bundle） | 宿主侧工作流注册表 + `/api/workflow-registry` 路由 |
| `dsh-workflow-settings/` | 组合包（bundle + client） | 设置页「工作流」列表（客户端） |

## 工作原理

```
打开工作文件夹 → 新建会话（使用安装了加载器的预设）
    → 会话第一次模型请求前，加载器扫描 <工作目录>/.dsh/workflows/*.mjs
    → 逐个 import 并 apply(ctx)，工作流注册的工具立刻可用
    → 加载报告上报宿主注册表 → 设置页「工作流」可见
```

## 安装

### 1. 安装三个组合包（文档方式）

```sh
dsh plugin --profile web add ./dsh-workflow-loader ./dsh-workflow-registry ./dsh-workflow-settings
dsh --profile web --dump-config   # 应看到 dsh-workflow-* 三个包的层
```

（`dsh plugin` 转发给 pnpm；如果 PATH 上没有 pnpm，可用 corepack：
`corepack enable pnpm` 后重试。）

### 2. 重启 Web UI（同下）

**方式 A：正式安装（文档方式）**

```sh
dsh plugin --profile web add ./dsh-workflow-registry
dsh plugin --profile web add ./dsh-workflow-settings
dsh --profile web --dump-config   # 应看到两个包的层
```

**方式 B：手动放置（免安装）**

1. 把 `dsh-workflow-registry`、`dsh-workflow-settings` 两个目录复制进
   DSH 部署的 `node_modules/`（与 `@deepseek-ai` 平级）；
2. 在 profile 的 `cordis.patch.yml` 中追加：

```yaml
- insert:
    - id: workflow-registry
      name: 'dsh-workflow-registry'
    - id: ui-workflows
      name: 'dsh-workflow-settings'
```

### 3. 重启 Web UI

重启 DSH Web 进程（例如 `npm exec @deepseek-ai/dsh web`）后：
- 设置面板中出现「工作流」页，显示各工作目录的自动加载报告；
- 用**任意预设**新建会话，打开含 `.dsh/workflows/` 的文件夹，发一条消息即可自动加载。

## 工作流文件约定

放在任意工作目录 `.dsh/workflows/`（兼容旧目录 `.dsh/plugins/`）下的 `.mjs` 文件：

```js
export const name = '我的工作流'          // 显示名（工作流列表用）
export const description = '一句话说明'     // 可选
export const inject = ['tools']           // 可选，需要的服务名（缺失则跳过）
export function apply(ctx) {              // 必需
  ctx.tools.register({
    name: 'my_tool',
    description: '...',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) { return { ok: true } },
  })
}
```

## 设置页勾选开关

设置 → 工作流 页里每个工作流带**启用勾选框**：

- 取消勾选 → 立即卸载该工作流的工具（状态变"已禁用"，名单持久化到
  `$DSH_HOME/storages/workflow-disabled.json`，重启后依然生效）；
- 重新勾选 → 立即加载；
- 「全部重新加载」→ 按当前勾选状态重载所有已报告目录。

## 会话内管理工具

加载器同时注册 `workflows` 工具：

- 不传参：返回最近一次自动加载报告与已加载工作流列表（名称 + 说明 + 状态）
- `action="reload"`：重新加载最近工作目录的全部工作流
- `action="load"` + `dir`：加载指定目录下的工作流

## 安全提醒

`.dsh/workflows/` 下的代码以当前会话的权限执行。只在自己信任的文件夹里放置工作流文件，不要打开来路不明的文件夹。
