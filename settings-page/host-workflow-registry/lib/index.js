/**
 * workflow-registry — 工作流注册表（宿主侧）
 *
 * 提供 `workflowRegistry` 服务：工作流加载器（预设内）把各工作目录的
 * 扫描报告上报到这里；同时注册 HTTP 路由 /api/workflow-registry，
 * 供设置页「工作流」列表读取。
 */

const reports = []

export const name = 'workflow-registry'
export const inject = ['webServer']

export function apply(ctx) {
  ctx.provide('workflowRegistry', {
    report(workspace, payload) {
      const entry = { workspace, payload, at: new Date().toISOString() }
      const idx = reports.findIndex((r) => r.workspace === workspace)
      if (idx >= 0) reports[idx] = entry
      else reports.unshift(entry)
      if (reports.length > 20) reports.length = 20
      return entry
    },
    list() {
      return [...reports]
    },
  })

  const offRoute = ctx.webServer.register({
    kind: 'exact',
    path: '/api/workflow-registry',
    handler(_req, res) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ workflows: reports }))
    },
  })
  ctx.effect(() => offRoute)
}
