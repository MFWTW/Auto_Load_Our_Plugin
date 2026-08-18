# dsh-workflow-loader

DeepSeek Harness (DSH) **文件夹工作流自动加载器**：让每个工作文件夹自带的 `.dsh/workflows/*.mjs` 在会话开始时自动加载，把文件夹变成"自带工作流"的工作区。配套提供**设置中的「工作流」列表页**。

## 内容

| 文件 | 作用 |
| --- | --- |
| `workflow-loader.mjs` | 工作流自动加载器（装入智能体预设，一次性配置） |
| `workflows/mcm-workflow.mjs` | 示例工作流：数学建模六阶段流程工具 `mcm_stage_guide` |
| `settings-page/host-workflow-registry/` | 宿主侧工作流注册表包（上报存储 + `/api/workflow-registry` 路由） |
| `settings-page/client-ui-workflows/` | 客户端「设置 → 工作流」页面包 |

## 工作原理

```
打开工作文件夹 → 新建会话（使用安装了加载器的预设）
    → 会话第一次模型请求前，加载器扫描 <工作目录>/.dsh/workflows/*.mjs
    → 逐个 import 并 apply(ctx)，工作流注册的工具立刻可用
    → 加载报告同时上报宿主注册表 → 设置页「工作流」可见
```

## 安装

### 1. 预设侧（工作流加载器）

打开智能体预设目录（用户预设默认在 `${DSH_HOME:-$HOME}/.dsh/.agent-presets/<预设id>/`）：

- 把 `workflow-loader.mjs` 复制进该目录；
- 在 `agent.cordis.yml` 末尾追加：
  ```yaml
  - id: workflow-loader
    name: ./workflow-loader.mjs
  ```
- 修改 `preset.yml` 的 `name` / `description`。

### 2. 宿主侧（设置页「工作流」列表，可选）

1. 把 `settings-page/host-workflow-registry` 与 `settings-page/client-ui-workflows`
   两个目录复制到 DSH 部署的 `node_modules/@deepseek-ai/` 下，
   目录名分别为 `dsh-host-workflow-registry` 与 `dsh-client-ui-workflows`。
2. 在所用 profile 的 `cordis.patch.yml` 里追加：
   ```yaml
   - insert:
       - id: workflow-registry
         name: '@deepseek-ai/dsh-host-workflow-registry'
       - id: ui-workflows
         name: '@deepseek-ai/dsh-client-ui-workflows'
   ```
3. 重启 DSH Web 进程。设置面板中即出现「工作流」页，
   显示各工作目录的自动加载报告（工作流名称、说明、状态、时间）。

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

## 会话内管理工具

加载器同时注册 `workflows` 工具：

- 不传参：返回最近一次自动加载报告与已加载工作流列表（名称 + 说明 + 状态）
- `action="reload"`：重新加载最近工作目录的全部工作流
- `action="load"` + `dir`：加载指定目录下的工作流

## 安全提醒

`.dsh/workflows/` 下的代码以当前会话的权限执行。只在自己信任的文件夹里放置工作流文件，不要打开来路不明的文件夹。
