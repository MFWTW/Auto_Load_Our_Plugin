/**
 * workflow-registry — 工作流注册表（宿主侧，Service 类形式插件）
 *
 * 提供 `workflowRegistry` 服务：工作流加载器（预设内）把各工作目录的
 * 扫描报告上报到这里；同时注册 HTTP 路由 /api/workflow-registry，
 * 供设置页「工作流」列表读取。
 */

import { Service } from '@deepseek-ai/cordis'

const reports = []

export default class WorkflowRegistry extends Service {
  static inject = ['webServer']

  constructor(ctx) {
    super(ctx, 'workflowRegistry')
    // 监听属于 ctx，插件卸载时由框架自动清理
    this.disposables = [
      ctx.webServer.register({
        kind: 'exact',
        path: '/api/workflow-registry',
        handler: (_req, res) => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ workflows: reports }))
        },
      }),
    ]
  }

  /** 上报一个工作目录的扫描报告；按目录去重，最多保留 maxReports 条。 */
  report(workspace, payload, maxReports = 20) {
    const entry = { workspace, payload, at: new Date().toISOString() }
    const idx = reports.findIndex((r) => r.workspace === workspace)
    if (idx >= 0) reports[idx] = entry
    else reports.unshift(entry)
    if (reports.length > maxReports) reports.length = maxReports
    return entry
  }

  /** 当前全部报告（时间倒序）。 */
  list() {
    return [...reports]
  }

  stop() {
    for (const dispose of this.disposables) dispose()
  }
}
