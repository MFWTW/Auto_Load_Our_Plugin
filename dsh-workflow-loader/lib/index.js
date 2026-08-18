/**
 * workflow-loader — 文件夹工作流自动加载器（宿主侧，文档格式）
 *
 * 每个会话的第一次模型请求前，扫描该会话工作目录下的
 * `.dsh/workflows/*.mjs`（兼容旧目录 `.dsh/plugins/`），逐个动态
 * 导入并 apply(ctx)，把目录自带的工作流注册为全局可用工具；
 * 同时把加载报告上报 workflowRegistry，供设置页「工作流」列表显示。
 *
 * 放在宿主层（组合包）意味着：任何预设、任何会话，只要工作目录
 * 里带了工作流文件，就会自动加载。
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import Schema from '@deepseek-ai/schemastery'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'workflow-loader'

/** 工具注册与文件读取的硬依赖。 */
export const inject = ['tools', 'fs']

/** 可调参数一律走 Config（行内 config 可覆盖）。 */
export const Config = Schema.object({
  /** 依次扫描的工作流目录（相对工作目录）。 */
  scanDirs: Schema.array(Schema.string()).default(['.dsh/workflows', '.dsh/plugins']),
  /** 注册表最多保留的工作目录报告数。 */
  maxReports: Schema.natural().default(20),
})

/** 已加载的文件路径 → 记录（进程生命周期内不重复加载）。 */
const loaded = new Map()
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

export function apply(ctx, config) {
  const { scanDirs, maxReports } = config

  function report(workspace, payload) {
    try {
      const registry = ctx.get('workflowRegistry')
      if (registry && typeof registry.report === 'function') registry.report(workspace, payload, maxReports)
    } catch {
      // 注册表未安装时降级为无上报。
    }
  }

  async function loadFrom(workspace, { reload = false } = {}) {
    const result = { workspace, workflows: [] }
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
      const files = entries.filter((e) => e.kind === 'file' && e.name.endsWith('.mjs'))
      for (const f of files) {
        const filePath = join(workspace, dir, f.name)
        if (!reload && loaded.has(filePath)) {
          const prev = loaded.get(filePath)
          result.workflows.push({ file: f.name, name: prev.name, status: 'already-loaded' })
          continue
        }
        try {
          const mod = await import(pathToFileURL(filePath).href + '?v=' + Date.now())
          const plugin = mod.default ?? mod
          if (typeof plugin?.apply !== 'function') {
            result.workflows.push({ file: f.name, status: 'skip: 未导出 apply 函数' })
            continue
          }
          if (Array.isArray(plugin.inject)) {
            const missing = plugin.inject.filter((n) => ctx.get(n) === undefined)
            if (missing.length > 0) {
              result.workflows.push({ file: f.name, status: 'skip: 缺少服务 ' + missing.join(', ') })
              continue
            }
          }
          plugin.apply(ctx)
          const displayName = typeof plugin.name === 'string' && plugin.name ? plugin.name : f.name
          const description = typeof plugin.description === 'string' ? plugin.description : ''
          loaded.set(filePath, { name: displayName, description, at: Date.now() })
          result.workflows.push({ file: f.name, name: displayName, status: 'loaded' })
        } catch (error) {
          result.workflows.push({ file: f.name, status: 'error: ' + String(error?.message ?? error) })
        }
      }
    }
    if (result.workflows.length === 0) result.empty = true
    return result
  }

  /** 会话开始前的自动扫描：宿主层监听同样能收到会话级事件。 */
  async function scanSession(cwd) {
    if (typeof cwd !== 'string' || !cwd || scanned.has(cwd)) return
    scanned.add(cwd)
    try {
      last = await loadFrom(cwd)
    } catch (error) {
      last = { workspace: cwd, error: String(error?.message ?? error) }
    }
    report(cwd, last)
  }

  ctx.on('agent/pre-step', async ({ agent }, next) => {
    await scanSession(findCwd(agent))
    return next()
  })

  // 兜底触发：会话创建时也可扫描（同一目录只扫一次，去重保证幂等）
  ctx.on('session/created', (session) => {
    const cwd = session?.header?.cwd ?? session?.meta?.cwd
    scanSession(cwd)
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
      action: { type: 'string', required: false, description: 'status | reload | load' },
      dir: { type: 'string', required: false, description: 'load 时要加载的目录（可选，默认最近工作目录）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      const action = args?.action ?? 'status'
      if (action === 'status') {
        return {
          loaded: [...loaded.entries()].map(([file, info]) => ({ file, name: info.name, description: info.description })),
          last,
        }
      }
      const workspace = args?.dir ?? last?.workspace
      if (!workspace) return { error: '尚未自动加载过任何目录，请先用 dir 指定目录' }
      const rpt = await loadFrom(workspace, { reload: action === 'reload' || action === 'load' })
      if (action !== 'status') {
        last = rpt
        report(workspace, rpt)
      }
      return { report: rpt }
    },
  }))
}
