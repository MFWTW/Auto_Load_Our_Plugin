/**
 * folder-plugins — 文件夹插件自动加载器
 *
 * 每个使用本预设的会话开始时，自动扫描该会话工作目录下的
 * `.dsh/plugins/*.mjs`，逐个动态导入并 apply(ctx)，把目录里的
 * 插件注册进当前会话（工具等）。
 *
 * 插件文件约定（与本地预设插件同构）：
 *   export const name = '...'      // 可选，诊断用
 *   export const inject = [...]    // 可选，需要的服务名（缺失则跳过）
 *   export function apply(ctx) {}  // 必需
 *
 * 安全提示：加载 .dsh/plugins/ 下的代码等同于执行工作目录中的脚本，
 * 只在自己信任的文件夹里放置插件文件。
 */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const name = 'folder-plugins'

/** 工具注册与文件读取的硬依赖；缺失时加载器整体停用。 */
export const inject = ['tools', 'fs']

const PLUGIN_DIR = '.dsh'
const PLUGIN_SUB = 'plugins'

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

export function apply(ctx) {
  async function loadFrom(workspace, { reload = false } = {}) {
    const dir = join(workspace, PLUGIN_DIR, PLUGIN_SUB)
    const report = { workspace, dir, plugins: [] }
    let target
    try {
      target = await ctx.fs.resolve(dir)
    } catch {
      report.notFound = true
      return report
    }
    let entries = []
    try {
      entries = await ctx.fs.listDir(target)
    } catch (error) {
      report.error = String(error?.message ?? error)
      return report
    }
    const files = entries.filter((e) => e.kind === 'file' && e.name.endsWith('.mjs'))
    if (files.length === 0) {
      report.empty = true
      return report
    }
    for (const f of files) {
      const filePath = join(dir, f.name)
      if (!reload && loaded.has(filePath)) {
        report.plugins.push({ file: f.name, status: 'already-loaded' })
        continue
      }
      try {
        const mod = await import(pathToFileURL(filePath).href + '?v=' + Date.now())
        const plugin = mod.default ?? mod
        if (typeof plugin?.apply !== 'function') {
          report.plugins.push({ file: f.name, status: 'skip: 未导出 apply 函数' })
          continue
        }
        if (Array.isArray(plugin.inject)) {
          const missing = plugin.inject.filter((n) => ctx.get(n) === undefined)
          if (missing.length > 0) {
            report.plugins.push({ file: f.name, status: 'skip: 缺少服务 ' + missing.join(', ') })
            continue
          }
        }
        plugin.apply(ctx)
        loaded.set(filePath, { plugin: plugin.name ?? f.name, at: Date.now() })
        report.plugins.push({ file: f.name, plugin: plugin.name ?? '', status: 'loaded' })
      } catch (error) {
        report.plugins.push({ file: f.name, status: 'error: ' + String(error?.message ?? error) })
      }
    }
    return report
  }

  // 自动加载：会话第一次预步时扫描工作目录
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const cwd = findCwd(agent)
    if (typeof cwd === 'string' && cwd && !scanned.has(cwd)) {
      scanned.add(cwd)
      try {
        last = await loadFrom(cwd)
      } catch (error) {
        last = { workspace: cwd, error: String(error?.message ?? error) }
      }
    }
    return next()
  })

  // 手动工具：查看状态 / 重新加载 / 指定目录加载
  ctx.tools.register({
    name: 'folder_plugins',
    description: [
      '文件夹插件管理工具：查看 .dsh/plugins 目录插件的自动加载情况，或手动加载指定目录下的插件文件。',
      '',
      '用法：不传参数或 action="status" 返回最近一次自动加载报告；',
      'action="reload" 重新加载最近工作目录的全部插件；',
      'action="load" 并给出 dir 参数可加载任意目录下的 .dsh/plugins/*.mjs。',
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
          loaded: [...loaded.entries()].map(([file, info]) => ({ file, plugin: info.plugin })),
          last,
        }
      }
      const workspace = args?.dir ?? last?.workspace
      if (!workspace) return { error: '尚未自动加载过任何目录，请先用 dir 指定目录' }
      const report = await loadFrom(workspace, { reload: action === 'reload' || action === 'load' })
      if (action !== 'status') last = report
      return { report }
    },
  })
}
