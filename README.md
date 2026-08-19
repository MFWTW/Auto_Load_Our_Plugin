# dsh-workflow-loader

DeepSeek Harness（DSH）**文件夹工作流自动加载器**：让每个工作文件夹自带的 `.dsh/workflows/*.mjs` 在会话开始时自动加载，把文件夹变成"自带工作流"的工作区。

客户端 UI（设置页「工作流」、右侧「工作流运行」面板）已拆分到
[MFWTW/dsh-UI-web](https://github.com/MFWTW/dsh-UI-web)。

## 仓库内容

| 路径 | 形态 | 作用 |
| --- | --- | --- |
| `dsh-workflow-loader/` | 组合包 | 工作流自动加载器：扫描 `.dsh/workflows/*.mjs` 并 apply；`/mathmodel` 命令；`workflows`/`workflow_run` 工具；向工作流文件注入运行上报桥 |
| `dsh-workflow-registry/` | 组合包（Service） | 加载报告 + 启用/禁用名单 + 工作流运行记录（runs）；`/api/workflow-registry` 与 `/api/workflow-runs` 路由 |
| `workflows/mcm-workflow.mjs` | 工作流文件 | 示例：数学建模六阶段流程工具 `mcm_stage_guide`（自动上报阶段进度） |

## 工作原理

```
打开工作文件夹 → 新建会话（使用安装了加载器的预设）
    → 会话第一次模型请求前，加载器扫描 <工作目录>/.dsh/workflows/*.mjs
    → 逐个 import 并 apply(ctx)，工作流注册的工具立刻可用
    → 加载报告上报宿主注册表 → 设置页「工作流」可见
```

## 安装

### 1. 安装两个宿主侧包

```sh
dsh plugin --profile web add ./dsh-workflow-loader ./dsh-workflow-registry
dsh --profile web --dump-config   # 应看到两个包的层
```

### 2. 安装 UI 包（来自 dsh-UI-web）

```sh
dsh plugin --profile web add ./dsh-workflow-settings ./dsh-workflow-run-panel
```

（`dsh plugin` 转发给 pnpm；若 PATH 无 pnpm，先 `corepack enable pnpm`。）

### 3. 重启 Web UI

```sh
npm exec @deepseek-ai/dsh web
```

重启并刷新页面后：设置面板出现「工作流」页；右边缘出现「工作流运行」箭头面板。

## 工作流文件约定

放在任意工作目录 `.dsh/workflows/`（兼容旧目录 `.dsh/plugins/`）下的 `.mjs` 文件：

```js
export const name = '我的工作流'
export const description = '一句话说明'
export const inject = ['tools']
export function apply(ctx) {
  // 可选：ctx.workflowRuns.report({ stage, status, result }) 上报进度到右侧面板
  ctx.tools.register({ /* ... */ })
}
```

## 斜杠命令

输入 `/` 弹出命令菜单，选择 **mathmodel** 后接文件路径：

```
/mathmodel 2025赛题C/C题.pdf      # 指定文件
/mathmodel                        # 不接参数 = 当前工作目录
```

执行后创建一条「运行中」记录（右侧面板可见）；随后每个阶段用 `mcm_stage_guide` 推进，进度自动同步。

## 会话内管理工具

- `workflows`：查看/重载工作流加载状态
- `workflow_run`：`list` 列出运行、`complete` 标记完成（带结果摘要）、`fail` 标记失败、`delete` 删除记录

## 安全提醒

`.dsh/workflows/` 下的代码以当前会话的权限执行。只在自己信任的文件夹里放置工作流文件，不要打开来路不明的文件夹。
