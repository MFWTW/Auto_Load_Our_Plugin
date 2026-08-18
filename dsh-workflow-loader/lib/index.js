/**
 * workflow-loader — 文件夹工作流自动加载器（宿主侧，文档格式）
 *
 * 每个会话的第一次模型请求前，扫描该会话工作目录下的
 * `.dsh/workflows/*.mjs`（兼容旧目录 `.dsh/plugins/`），逐个动态
 * 导入并 apply(ctx)，把目录自带的工作流注册为全局可用工具；
 * 同时把加载报告上报 workflowRegistry，供设置页「工作流」列表显示。
 *
 * 支持设置页勾选开关：加载器捕获每个工作流注册的 disposer，
 * 禁用即时卸载、启用即时加载；禁用名单由注册表持久化。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'workflow-loader'

/** 工具注册、文件读取与注册表的硬依赖。 */
export const inject = ['tools', 'fs', 'workflowRegistry', 'commands']

/** 可调参数一律走 Config（行内 config 可覆盖）。 */
export const Config = Schema.object({
  /** 依次扫描的工作流目录（相对工作目录）。 */
  scanDirs: Schema.array(Schema.string()).default(['.dsh/workflows', '.dsh/plugins']),
  /** 注册表最多保留的工作目录报告数。 */
  maxReports: Schema.natural().default(20),
})

/** 已加载记录：filePath → { workspace, rel, name, description, disposers, status } */
const records = new Map()
/** 已扫描过的工作目录。 */
const workspaces = new Set()
/** 最近一次自动加载的结果。 */
let last = null
/** 已自动扫描过的工作目录（每目录每进程只自动扫一次）。 */
const scanned = new Set()

function findCwd(agent) {
  return agent?.session?.header?.cwd
    ?? agent?.cwd
    ?? agent?.workspace
    ?? null
}

function relParts(rel) {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? [rel.slice(0, i), rel.slice(i + 1)] : ['', rel]
}

/** 给工作流一个捕获 disposer 的子上下文：tools.register 的返回值被记录。 */
function makeSubCtx(ctx, disposers) {
  const sub = Object.create(ctx)
  const tools = ctx.tools
  sub.tools = Object.create(tools)
  sub.tools.register = (definition) => {
    const off = tools.register(definition)
    if (typeof off === 'function') disposers.push(off)
    return off
  }
  return sub
}

export function apply(ctx, config) {
  const registry = ctx.workflowRegistry
  const { scanDirs, maxReports } = config

  function report(workspace) {
    const payload = { workspace, workflows: [] }
    for (const [filePath, rec] of records) {
      if (rec.workspace !== workspace) continue
      payload.workflows.push({ file: rec.rel, name: rec.name, description: rec.description, status: rec.status })
    }
    if (payload.workflows.length === 0) payload.empty = true
    last = payload
    registry.report(workspace, payload, maxReports)
    return payload
  }

  async function loadFile(workspace, rel) {
    const [dir, name] = relParts(rel)
    const filePath = join(workspace, rel)
    const rec = { workspace, rel, name, description: '', disposers: [], status: 'loaded' }
    if (registry.isDisabled(workspace, rel)) {
      rec.status = 'disabled'
      records.set(filePath, rec)
      return rec
    }
    try {
      const mod = await import(pathToFileURL(filePath).href + '?v=' + Date.now())
      const plugin = mod.default ?? mod
      if (typeof plugin?.apply !== 'function') {
        rec.status = 'skip: 未导出 apply 函数'
        records.set(filePath, rec)
        return rec
      }
      if (Array.isArray(plugin.inject)) {
        const missing = plugin.inject.filter((n) => ctx.get(n) === undefined)
        if (missing.length > 0) {
          rec.status = 'skip: 缺少服务 ' + missing.join(', ')
          records.set(filePath, rec)
          return rec
        }
      }
      plugin.apply(makeSubCtx(ctx, rec.disposers))
      rec.name = typeof plugin.name === 'string' && plugin.name ? plugin.name : name
      rec.description = typeof plugin.description === 'string' ? plugin.description : ''
      records.set(filePath, rec)
      return rec
    } catch (error) {
      rec.status = 'error: ' + String(error?.message ?? error)
      records.set(filePath, rec)
      return rec
    }
  }

  function dispose(rec) {
    for (const off of rec.disposers) {
      try { off() } catch { /* 忽略卸载异常 */ }
    }
    rec.disposers = []
  }

  async function loadFrom(workspace, { reload = false } = {}) {
    workspaces.add(workspace)
    for (const dir of scanDirs) {
      let target
      try {
        target = await ctx.fs.resolve(join(workspace, dir))
      } catch {
        continue
      }
      let entries = []
      try {
        entries = await ctx.fs.listDir(target)
      } catch (error) {
        result.workflows.push({ dir, status: 'error: ' + String(error?.message ?? error) })
        continue
      }
      // FsDirEntry 的条目类型字段是 type（'file' | 'directory' | ...）
      const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.mjs'))
      for (const f of files) {
        const rel = dir + '/' + f.name
        const filePath = join(workspace, rel)
        const prev = records.get(filePath)
        if (prev && !reload && prev.status !== 'disabled') continue
        if (reload && prev) dispose(prev)
        await loadFile(workspace, rel)
      }
    }
    return report(workspace)
  }

  async function scanSession(cwd) {
    if (typeof cwd !== 'string' || !cwd || scanned.has(cwd)) return
    scanned.add(cwd)
    try {
      await loadFrom(cwd)
    } catch (error) {
      last = { workspace: cwd, error: String(error?.message ?? error) }
      registry.report(cwd, last, maxReports)
    }
  }

  // 自动加载：会话第一次预步时扫描工作目录（宿主层监听同样收到会话级事件）
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    await scanSession(findCwd(agent))
    return next()
  })

  // 兜底触发：会话创建时也可扫描（同一目录只扫一次，去重保证幂等）
  ctx.on('session/created', (session) => {
    const cwd = session?.header?.cwd ?? session?.meta?.cwd
    scanSession(cwd)
  })

  // 设置页开关钩子：挂到注册表
  registry.attach({
    /** 设置页打开时按需扫描一个工作目录（幂等：已加载的不重复 import）。 */
    async scan(workspace) {
      if (typeof workspace !== 'string' || !workspace) return { error: 'workspace 缺失' }
      return { report: await loadFrom(workspace) }
    },
    async onToggle(workspace, rel, disabled) {
      const filePath = join(workspace, rel)
      const prev = records.get(filePath)
      if (disabled) {
        if (prev) {
          dispose(prev)
          prev.status = 'disabled'
          records.set(filePath, prev)
        } else {
          records.set(filePath, { workspace, rel, name: relParts(rel)[1], description: '', disposers: [], status: 'disabled' })
        }
      } else {
        if (prev) dispose(prev)
        await loadFile(workspace, rel)
      }
      return report(workspace)
    },
    async reloadAll() {
      const out = []
      for (const ws of [...workspaces]) out.push(await loadFrom(ws, { reload: true }))
      return { ok: true, reports: out }
    },
  })

  // 斜杠命令：输入框输入 / 弹出命令菜单，选择 mathmodel（数学建模）后跟文件路径即可
  ctx.commands.register({
    name: 'mathmodel',
    description: '数学建模：按六阶段流程求解指定文件（审题→数据分析→选方法→建模求解→写作→自检打磨）',
    input: { hint: '[<文件路径>]' },
    handler: async (invocation) => {
      const file = String(invocation.rawInput ?? '').trim()
      const cwd = invocation.agent?.session?.header?.cwd ?? ''
      const target = file.length > 0 ? file : cwd
      // 先确保当前工作目录的工作流已加载
      if (typeof cwd === 'string' && cwd) {
        try {
          await loadFrom(cwd)
        } catch { /* 扫描失败不阻塞命令 */ }
      }
      return {
        kind: 'success',
        text: [
          '数学建模工作流已启动：' + target,
          '流程：审题 → 数据分析 → 选方法 → 建模求解 → 写作 → 自检打磨',
          '每个阶段开始前调用 mcm_stage_guide 工具获取检查清单与产出要求；',
          '用 workflows 工具可查看工作流加载状态。',
        ].join('\n'),
      }
    },
  })

  ctx.tools.register(defineTool({
    name: 'workflows',
    description: [
      '工作流加载器：查看当前工作目录 .dsh/workflows/ 中工作流的自动加载情况，或手动加载指定目录下的工作流文件。',
      '',
      '用法：不传参数或 action="status" 返回最近一次自动加载报告与已加载工作流列表；',
      'action="reload" 重新加载最近工作目录的全部工作流；',
      'action="load" 并给出 dir 参数可加载任意目录下的 .dsh/workflows/*.mjs。',
    ].join('\n'),
    parameters: {
      action: { type: 'string', description: 'status | reload | load' },
      dir: { type: 'string', description: 'load 时要加载的目录（可选，默认最近工作目录）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const action = args?.action ?? 'status'
      if (action === 'status') {
        return {
          loaded: [...records.entries()].map(([filePath, info]) => ({ file: info.rel, name: info.name, description: info.description, status: info.status })),
          last,
        }
      }
      const workspace = args?.dir ?? last?.workspace
      if (!workspace) return { error: '尚未自动加载过任何目录，请先用 dir 指定目录' }
      return { report: await loadFrom(workspace, { reload: action === 'reload' || action === 'load' }) }
    },
  }))
}
