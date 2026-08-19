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
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'

const MAX_BODY = 16 * 1024

function storagePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'workflow-disabled.json')
}

function runsPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'workflow-runs.json')
}

export default class WorkflowRegistry extends Service {
  static inject = ['webServer', 'fs']

  constructor(ctx) {
    super(ctx, 'workflowRegistry')
    this.reports = []
    this.disabled = new Set()
    this.runs = []
    this.loader = null
    this.loadDisabled()
    this.loadRuns()
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

  async loadRuns() {
    try {
      const target = await this.ctx.fs.resolve(runsPath())
      const text = await this.ctx.fs.readText(target)
      const list = JSON.parse(text)
      if (Array.isArray(list)) {
        this.runs = list.filter((x) => x && typeof x === 'object')
        // 服务重启后没有任何会话在真正执行工作流：把残留的 running 记录标记为
        // interrupted，避免右侧面板永久显示「运行中」。后续 mcm_stage_guide /
        // /mathmodel 上报时会重新激活（status 回到 running）或新建记录。
        const stale = this.runs.filter((r) => r.status === 'running')
        if (stale.length > 0) {
          const at = new Date().toISOString()
          for (const run of stale) {
            run.status = 'interrupted'
            run.result = '服务重启，运行记录自动中断；如需继续请重新启动工作流（/mathmodel 或 mcm_stage_guide）'
            run.interruptedAt = at
          }
          void this.persistRuns()
        }
      }
    } catch {
      // 首次运行或读取失败：保持空数组
    }
  }

  async persistRuns() {
    try {
      const target = await this.ctx.fs.resolve(runsPath())
      await this.ctx.fs.writeText(target, JSON.stringify(this.runs))
    } catch {
      // 持久化失败时仅内存生效
    }
  }

  /** 新建一条运行记录（状态 running）。 */
  startRun(info = {}) {
    const run = {
      id: randomUUID(),
      name: typeof info.name === 'string' && info.name ? info.name : '工作流',
      target: typeof info.target === 'string' ? info.target : '',
      workspace: typeof info.workspace === 'string' ? info.workspace : '',
      status: 'running',
      stage: typeof info.stage === 'number' ? info.stage : 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      stages: Array.isArray(info.stages) ? info.stages : [],
      log: [],
      // 按阶段组织的思考过程：{ "1": [{ at, text }], "2": [...] }
      thinking: {},
      current: null,
      // 启动该记录所属的会话 id（由 /mathmodel 写入；会话结束时据此自动中断记录）
      sessionId: typeof info.sessionId === 'string' ? info.sessionId : null,
    }
    this.runs.unshift(run)
    void this.persistRuns()
    return run
  }

  /** 向一条运行记录的指定阶段追加一条思考过程（无记录则返回 null）。 */
  appendThinking(id, stage, text) {
    const run = this.runs.find((r) => r.id === id)
    if (!run) return null
    if (!run.thinking || typeof run.thinking !== 'object') run.thinking = {}
    const key = String(typeof stage === 'number' ? stage : 0)
    if (!Array.isArray(run.thinking[key])) run.thinking[key] = []
    run.thinking[key].push({ at: new Date().toISOString(), text: String(text ?? '') })
    // 同步进活动日志，保证旧面板也能看到
    if (!Array.isArray(run.log)) run.log = []
    run.log.push({ at: new Date().toISOString(), stage: typeof stage === 'number' ? stage : run.stage, message: '🧠 ' + String(text ?? '') })
    if (run.log.length > 200) run.log.splice(0, run.log.length - 200)
    void this.persistRuns()
    return run
  }

  /** 更新一条运行记录（过滤 undefined 字段）。 */
  updateRun(id, patch = {}) {
    const run = this.runs.find((r) => r.id === id)
    if (!run) return null
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) run[k] = v
    }
    if ((patch.status === 'completed' || patch.status === 'failed') && !run.completedAt) {
      run.completedAt = new Date().toISOString()
    }
    void this.persistRuns()
    return run
  }

  /** 删除一条运行记录。 */
  deleteRun(id) {
    const i = this.runs.findIndex((r) => r.id === id)
    if (i < 0) return false
    this.runs.splice(i, 1)
    void this.persistRuns()
    return true
  }

  /** 某工作目录当前正在运行的记录（最近一条）。 */
  activeRun(workspace) {
    return this.runs.find((r) => r.status === 'running' && (workspace == null || workspace === '' || r.workspace === workspace)) ?? null
  }

  /** 汇报进度：更新活跃运行，没有则自动新建一条。 */
  reportRun(workspace, payload = {}) {
    let run = this.activeRun(workspace)
    if (!run) {
      run = this.startRun({ workspace, name: typeof payload.name === 'string' ? payload.name : '工作流', stage: typeof payload.stage === 'number' ? payload.stage : 0 })
    }
    if (typeof payload.stage === 'number') run.stage = payload.stage
    if (typeof payload.target === 'string' && payload.target) run.target = payload.target
    if (Array.isArray(payload.stages)) run.stages = payload.stages
    if (typeof payload.message === 'string' && payload.message) {
      run.current = payload.message
      if (!Array.isArray(run.log)) run.log = []
      run.log.push({ at: new Date().toISOString(), stage: typeof payload.stage === 'number' ? payload.stage : run.stage, message: payload.message })
      if (run.log.length > 200) run.log.splice(0, run.log.length - 200)
    }
    // 思考过程上报：payload.thinking 可为单条文本或 { stage: [text,...] }
    if (payload.thinking !== undefined) {
      if (!run.thinking || typeof run.thinking !== 'object') run.thinking = {}
      if (typeof payload.thinking === 'string') {
        const key = String(typeof payload.stage === 'number' ? payload.stage : run.stage)
        if (!Array.isArray(run.thinking[key])) run.thinking[key] = []
        run.thinking[key].push({ at: new Date().toISOString(), text: payload.thinking })
      } else if (payload.thinking && typeof payload.thinking === 'object' && !Array.isArray(payload.thinking)) {
        for (const [key, entries] of Object.entries(payload.thinking)) {
          if (!Array.isArray(entries)) continue
          if (!Array.isArray(run.thinking[key])) run.thinking[key] = []
          for (const entry of entries) {
            const text = typeof entry === 'string' ? entry : (entry && typeof entry.text === 'string' ? entry.text : '')
            if (!text) continue
            run.thinking[key].push({ at: new Date().toISOString(), text })
          }
        }
      }
    }
    if (payload.status === 'completed' || payload.status === 'failed') {
      run.status = payload.status
      if (!run.completedAt) run.completedAt = new Date().toISOString()
      if (typeof payload.result === 'string') run.result = payload.result
    } else if (payload.status === 'running') {
      run.status = 'running'
    }
    void this.persistRuns()
    return run
  }

  /** 完成最近的活跃运行。 */
  completeActiveRun(result) {
    const run = this.activeRun('')
    if (!run) return null
    return this.updateRun(run.id, { status: 'completed', result: typeof result === 'string' ? result : '已完成' })
  }

  listRuns() {
    return [...this.runs]
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

    const offRunsRoute = this.ctx.webServer.register({
      kind: 'exact',
      path: '/api/workflow-runs',
      handler: (req, res) => {
        if (req.method === 'GET') return this.respond(res, { runs: this.listRuns() })
        if (req.method !== 'POST') return this.respond(res, { error: 'method not allowed' }, 405)
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
          if (body.length > MAX_BODY) req.destroy()
        })
        req.on('end', () => {
          try {
            const payload = body ? JSON.parse(body) : {}
            this.respond(res, this.handleRunsPost(payload))
          } catch (error) {
            this.respond(res, { error: String(error?.message ?? error) }, 400)
          }
        })
      },
    })
    this.disposables.push(offRunsRoute)
  }

  handleRunsPost(payload) {
    switch (payload.action) {
      case 'delete': {
        if (typeof payload.id !== 'string' || !payload.id) return { error: 'delete 需要 id' }
        return { ok: this.deleteRun(payload.id) }
      }
      case 'start': {
        return { run: this.startRun(payload) }
      }
      case 'progress': {
        if (typeof payload.id !== 'string' || !payload.id) return { error: 'progress 需要 id' }
        const run = this.updateRun(payload.id, { status: 'running', stage: typeof payload.stage === 'number' ? payload.stage : undefined })
        return run ? { ok: true, run } : { error: 'run 不存在' }
      }
      case 'note': {
        if (typeof payload.id !== 'string' || !payload.id) return { error: 'note 需要 id' }
        const stage = typeof payload.stage === 'number' ? payload.stage : undefined
        if (typeof payload.text !== 'string' || !payload.text) return { error: 'note 需要 text' }
        const run = this.appendThinking(payload.id, stage, payload.text)
        return run ? { ok: true, run } : { error: 'run 不存在' }
      }
      case 'complete': {
        if (typeof payload.id !== 'string' || !payload.id) return { error: 'complete 需要 id' }
        const run = this.updateRun(payload.id, { status: 'completed', result: typeof payload.result === 'string' ? payload.result : '已完成' })
        return run ? { ok: true, run } : { error: 'run 不存在' }
      }
      case 'fail': {
        if (typeof payload.id !== 'string' || !payload.id) return { error: 'fail 需要 id' }
        const run = this.updateRun(payload.id, { status: 'failed', result: typeof payload.error === 'string' ? payload.error : '失败' })
        return run ? { ok: true, run } : { error: 'run 不存在' }
      }
      default:
        return { error: 'unknown action' }
    }
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
    if (payload.action === 'scan') {
      const { workspace } = payload
      if (typeof workspace !== 'string' || !workspace) return { error: 'scan 需要 workspace' }
      if (this.loader && typeof this.loader.scan === 'function') return await this.loader.scan(workspace)
      return { ok: true, note: 'loader 未就绪' }
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
