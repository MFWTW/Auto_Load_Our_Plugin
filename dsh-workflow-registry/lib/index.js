/**
 * workflow-registry — 工作流注册表（宿主侧，Service 类形式插件）
 *
 * 职责：
 *  - 保存各工作目录的加载报告（供设置页「工作流」列表）；
 *  - 保存工作流启用/禁用名单（持久化到 $DSH_HOME/storages/workflow-disabled.json）；
 *  - HTTP 路由 /api/workflow-registry：
 *      GET    → { workflows, disabled }
 *      POST   → { action: 'toggle', workspace, file, disabled }  勾选开关
 *             → { action: 'reload' }                             重新加载全部
 */

import { Service } from '@deepseek-ai/cordis'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAX_BODY = 16 * 1024

function storagePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'workflow-disabled.json')
}

export default class WorkflowRegistry extends Service {
  static inject = ['webServer', 'fs']

  constructor(ctx) {
    super(ctx, 'workflowRegistry')
    this.reports = []
    this.disabled = new Set()
    this.loader = null
    this.loadDisabled()
    this.registerRoutes()
  }

  async loadDisabled() {
    try {
      const target = await this.ctx.fs.resolve(storagePath())
      const text = await this.ctx.fs.readText(target)
      const list = JSON.parse(text)
      if (Array.isArray(list)) this.disabled = new Set(list.filter((x) => typeof x === 'string'))
    } catch {
      // 首次运行或读取失败：保持空集合
    }
  }

  async persistDisabled() {
    try {
      const target = await this.ctx.fs.resolve(storagePath())
      await this.ctx.fs.writeText(target, JSON.stringify([...this.disabled]))
    } catch {
      // 持久化失败时仅内存生效
    }
  }

  registerRoutes() {
    const offRoute = this.ctx.webServer.register({
      kind: 'exact',
      path: '/api/workflow-registry',
      handler: (req, res) => {
        if (req.method === 'GET') return this.respond(res, { workflows: this.reports, disabled: [...this.disabled] })
        if (req.method !== 'POST') return this.respond(res, { error: 'method not allowed' }, 405)
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
          if (body.length > MAX_BODY) req.destroy()
        })
        req.on('end', async () => {
          try {
            const payload = body ? JSON.parse(body) : {}
            this.respond(res, await this.handlePost(payload))
          } catch (error) {
            this.respond(res, { error: String(error?.message ?? error) }, 400)
          }
        })
      },
    })
    this.disposables = [offRoute]
  }

  async handlePost(payload) {
    if (payload.action === 'toggle') {
      const { workspace, file, disabled } = payload
      if (typeof workspace !== 'string' || typeof file !== 'string') return { error: 'toggle 需要 workspace 与 file' }
      const key = workspace + '::' + file
      if (disabled) this.disabled.add(key)
      else this.disabled.delete(key)
      await this.persistDisabled()
      if (this.loader && typeof this.loader.onToggle === 'function') {
        await this.loader.onToggle(workspace, file, Boolean(disabled))
      }
      return { ok: true, disabled: [...this.disabled] }
    }
    if (payload.action === 'reload') {
      if (this.loader && typeof this.loader.reloadAll === 'function') return await this.loader.reloadAll()
      return { ok: true, note: 'loader 未就绪' }
    }
    return { error: 'unknown action' }
  }

  respond(res, value, status = 200) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(value))
  }

  /** 上报一个工作目录的扫描报告；按目录去重，最多保留 maxReports 条。 */
  report(workspace, payload, maxReports = 20) {
    const entry = { workspace, payload, at: new Date().toISOString() }
    const idx = this.reports.findIndex((r) => r.workspace === workspace)
    if (idx >= 0) this.reports[idx] = entry
    else this.reports.unshift(entry)
    if (this.reports.length > maxReports) this.reports.length = maxReports
    return entry
  }

  /** 当前全部报告（时间倒序）。 */
  list() {
    return [...this.reports]
  }

  /** 某工作流文件是否被禁用（key = workspace::相对路径）。 */
  isDisabled(workspace, file) {
    return this.disabled.has(workspace + '::' + file)
  }

  /** 加载器启动后挂接自己的回调。 */
  attach(loader) {
    this.loader = loader
  }

  stop() {
    for (const dispose of this.disposables ?? []) dispose()
  }
}
