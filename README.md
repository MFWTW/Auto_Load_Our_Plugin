# dsh-plugin

DeepSeek Harness (DSH) 文件夹插件集合：让每个工作文件夹自带的 `.dsh/plugins/*.mjs` 在会话开始时**自动加载**。

## 内容

| 文件 | 作用 |
| --- | --- |
| `folder-plugins.mjs` | 文件夹插件**自动加载器**（装入智能体预设，一次性配置） |
| `plugins/mcm-workflow.mjs` | 示例插件：数学建模六阶段流程工具 `mcm_stage_guide` |

## 工作原理

```
打开工作文件夹 → 新建会话（使用安装了加载器的预设）
    → 会话第一次模型请求前，加载器扫描 <工作目录>/.dsh/plugins/*.mjs
    → 逐个 import 并 apply(ctx)，插件注册的工具立刻可用
```

## 安装（只需一次）

1. 打开你的智能体预设目录（用户预设默认在 `${DSH_HOME:-$HOME}/.dsh/.agent-presets/<预设id>/`）。
   推荐先复制一个现有预设：
   - 把 `folder-plugins.mjs` 复制进该目录；
   - 在该目录的 `agent.cordis.yml` 末尾追加一行：
     ```yaml
     - id: folder-plugins
       name: ./folder-plugins.mjs
     ```
   - 修改 `preset.yml` 的 `name` / `description`。
2. 在网页里用这个预设新建会话（打开你要用的工作文件夹）。

## 插件文件约定

放在任意工作目录 `.dsh/plugins/` 下的 `.mjs` 文件：

```js
export const name = 'my-plugin'        // 可选，诊断用
export const inject = ['tools']        // 可选，需要的服务名（缺失则跳过）
export function apply(ctx) {           // 必需
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

加载器同时注册 `folder_plugins` 工具：

- 不传参：查看最近一次自动加载报告与已加载插件
- `action="reload"`：重新加载最近工作目录的全部插件
- `action="load"` + `dir`：加载指定目录下的插件

## 安全提醒

`.dsh/plugins/` 下的代码以当前会话的权限执行。只在自己信任的文件夹里放置插件文件，不要打开来路不明的文件夹。
