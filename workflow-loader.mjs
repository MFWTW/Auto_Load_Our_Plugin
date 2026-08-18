/**
 * workflow-loader — 文件夹工作流自动加载器（预设侧插件）
 *
 * 每个使用本预设的会话开始时，自动扫描该会话工作目录下的
 * `.dsh/workflows/*.mjs`（兼容旧目录 `.dsh/plugins/`），逐个动态
 * 导入并 apply(ctx)，把目录自带的工作流注册进当前会话。
 *
 * 插件形态遵循《第一个插件 / 插件配置》文档：
 *   - 导出 name / inject / apply(ctx, config)，行内可传 config；
 *   - 所有注册（监听、工具）都属于 ctx，卸载时自动清理。
 *
 * 注：预设目录下的本地插件文件按 Node 规则解析导入，无法 import
 * 部署内的 @deepseek-ai 包（defineTool / Schemastery），因此本文件
 * 保持零依赖：Config 用手写默认值 + 类型检查，工具用等价的对象
 * 定义直接注册。需要 import 部署包的形态请用组合包（见
 * dsh-workflow-registry / dsh-workflow-settings）。
 */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'workflow-loader'

/** 工具注册与文件读取的硬依赖；缺失时加载器整体停用。 */
export const inject = ['tools', 'fs']

/** 默认配置（可在 agent.cordis.yml 的行 config 里覆盖）。 */
const DEFAULT_CONFIG = {
  /** 依次扫描的工作流目录（相对工作目录）。 */
  scanDirs: ['.dsh/workflows', '.dsh/plugins'],
  /** 注册表最多保留的工作目录报告数。 */
  maxReports: 20,
}

/** 已加载的文件路径 → 记录（进程生命周期内不重复加载）。 */
const loaded = new Map()
/** 最近一次自动加载的结果。 */
let last = null
/** 已自动扫描过的工作目录（每目录每进程只自动扫一次）。 */
const scanned = new Set()

function normalizeConfig(config) {
  const source = config === undefined || config === null ? {} : config
  const scanDirs = Array.isArray(source.scanDirs)
    ? source.scanDirs.filter((d) => typeof d === 'string' && d.length > 0)
    : DEFAULT_CONFIG.scanDirs
  const maxReports = typeof source.maxReports === 'number' && Number.isFinite(source.maxReports)
    ? Math.max(1, Math.floor(source.maxReports))
    : DEFAULT_CONFIG.maxReports
  return { scanDirs, maxReports }
}

function findCwd(agent) {
  return agent?.session?.header?.cwd
    ?? agent?.cwd
    ?? agent?.workspace
    ?? null
}

export function apply(ctx, config) {
  const { scanDirs, maxReports } = normalizeConfig(config)

  /** 上报宿主侧注册表（供设置页「工作流」列表读取；服务缺失时静默跳过）。 */
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

  // 自动加载：会话第一次预步时扫描工作目录（监听属于 ctx，卸载自动清理）
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const cwd = findCwd(agent)
    if (typeof cwd === 'string' && cwd && !scanned.has(cwd)) {
      scanned.add(cwd)
      try {
        last = await loadFrom(cwd)
      } catch (error) {
        last = { workspace: cwd, error: String(error?.message ?? error) }
      }
      report(cwd, last)
    }
    return next()
  })

  // 手动工具：查看工作流列表 / 重新加载 / 指定目录加载
  ctx.tools.register({
    name: 'workflows',
    description: [
      '工作流加载器：查看当前工作目录 .dsh/workflows/ 中工作流的自动加载情况，或手动加载指定目录下的工作流文件。',
      '',
      '用法：不传参数或 action="status" 返回最近一次自动加载报告与已加载工作流列表；',
      'action="reload" 重新加载最近工作目录的全部工作流；',
      'action="load" 并给出 dir 参数可加载任意目录下的 .dsh/workflows/*.mjs。',
    ].join('\n'),
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', description: 'status | reload | load' },
        dir: { type: 'string', description: 'load 时要加载的目录（可选，默认最近工作目录）' },
      },
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
  })
}
