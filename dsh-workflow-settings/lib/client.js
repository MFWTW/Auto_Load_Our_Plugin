/**
 * ui-workflows — 设置中的「工作流」页（客户端）
 * 列出工作流加载器上报的加载报告（来自 /api/workflow-registry），
 * 每个工作流带滑动开关（样式与产品控件一致），开关即时生效：
 * 关闭=卸载，打开=加载。禁用名单由注册表持久化。
 */
window.__ModuleLoader__.load({
  id: 'dsh-workflow-settings',
  factory: (require) => {
    const react = require('react')
    const { createElement: h, useState, useEffect, useCallback } = react

    const s = {
      wrap: { padding: '16px 20px', fontSize: '13px', lineHeight: '1.6' },
      title: { fontSize: '15px', fontWeight: 600, marginBottom: '6px' },
      sub: { opacity: 0.65, fontSize: '12px', marginBottom: '14px' },
      head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
      btn: {
        fontSize: '12px', cursor: 'pointer', padding: '4px 12px', borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit',
      },
      card: {
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '8px',
        padding: '10px 12px', marginBottom: '8px',
      },
      row: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' },
      left: { display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0, flex: 1 },
      name: { fontWeight: 600 },
      desc: { opacity: 0.75, fontSize: '12px', marginTop: '2px' },
      file: { opacity: 0.55, fontSize: '11px', marginTop: '2px', wordBreak: 'break-all' },
      badge: { fontSize: '11px', padding: '1px 8px', borderRadius: '10px', flexShrink: 0 },
      empty: { opacity: 0.6, padding: '24px 0', textAlign: 'center' },
      switch: {
        position: 'relative', width: 34, height: 20, borderRadius: 10, flexShrink: 0,
        cursor: 'pointer', display: 'inline-block', border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-interactive-bg-hover)', transition: 'background .15s ease, border-color .15s ease',
      },
      switchOn: {
        background: 'var(--dsw-alias-state-success-primary)', borderColor: 'transparent',
      },
      knob: {
        position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%',
        background: '#fff', transition: 'left .15s ease',
      },
    }
    const badgeColor = (status) => status === 'loaded'
      ? { background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)', color: 'var(--dsw-alias-state-success-primary)' }
      : status === 'disabled'
        ? { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)' }
        : status.startsWith('error')
          ? { background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)', color: 'var(--dsw-alias-state-error-primary)' }
          : { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)' }
    const statusText = (status) => status === 'loaded' ? '已加载'
      : status === 'disabled' ? '已停用'
      : status === 'already-loaded' ? '已加载过'
      : status.startsWith('error') ? '出错' : status

    function post(action, extra) {
      return fetch('/api/workflow-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, extra || {})),
      })
    }

    function WorkflowsPage(props) {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [tick, setTick] = useState(0)

      // 打开设置页即按需扫描所有工作区（useWorkspaces 为设置页标准 prop）
      const useWorkspaces = props && typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces
        : () => ({ items: [], phase: 'ready' })
      const wsSnapshot = useWorkspaces((s) => s)
      const scannedOnOpen = useState(false)
      const [didScan, setDidScan] = scannedOnOpen
      useEffect(() => {
        if (didScan || wsSnapshot.phase !== 'ready') return
        setDidScan(true)
        const items = Array.isArray(wsSnapshot.items) ? wsSnapshot.items : []
        const paths = items.map((w) => w && w.path).filter((x) => typeof x === 'string' && x)
        Promise.all(paths.map((workspace) => post('scan', { workspace }).catch(() => null)))
          .then(() => setTick((t) => t + 1))
      }, [wsSnapshot.phase, wsSnapshot.items, didScan])

      useEffect(() => {
        let alive = true
        fetch('/api/workflow-registry')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((json) => { if (alive) { setData(json); setError('') } })
          .catch((e) => { if (alive) { setData(null); setError(String(e && e.message || e)) } })
        return () => { alive = false }
      }, [tick])

      const toggle = useCallback((workspace, file, nextEnabled) => {
        post('toggle', { workspace, file, disabled: !nextEnabled })
          .then(() => setTick((t) => t + 1))
          .catch((e) => setError('切换失败：' + String(e && e.message || e)))
      }, [])

      const reloadAll = useCallback(() => {
        post('reload')
          .then(() => setTick((t) => t + 1))
          .catch((e) => setError('重新加载失败：' + String(e && e.message || e)))
      }, [])

      const disabledSet = new Set(data && Array.isArray(data.disabled) ? data.disabled : [])
      const items = data && Array.isArray(data.workflows) ? data.workflows : []
      const rows = []
      for (const ws of items) {
        const list = ws.payload && Array.isArray(ws.payload.workflows) ? ws.payload.workflows : []
        rows.push(h('div', { key: ws.workspace, style: s.card },
          h('div', { style: s.row },
            h('span', { style: s.name }, ws.workspace),
            h('span', { style: s.sub }, ws.at ? new Date(ws.at).toLocaleString() : ''),
          ),
          list.length === 0
            ? h('div', { style: s.empty }, '该目录下没有 .dsh/workflows/ 工作流文件')
            : list.map((w, i) => {
                const enabled = !disabledSet.has(ws.workspace + '::' + w.file)
                return h('div', { key: i, style: { marginTop: 8, borderTop: '1px dashed var(--dsw-alias-border-l2)', paddingTop: 8 } },
                  h('div', { style: s.left },
                    h('button', {
                      type: 'button', role: 'switch', 'aria-checked': enabled,
                      'aria-label': (w.name || w.file) + (enabled ? ' 已启用' : ' 已停用'),
                      style: { ...s.switch, ...(enabled ? s.switchOn : null) },
                      onClick: () => toggle(ws.workspace, w.file, !enabled),
                    },
                      h('span', { style: { ...s.knob, left: enabled ? 16 : 2 } }),
                    ),
                    h('div', { style: { minWidth: 0 } },
                      h('div', { style: s.row },
                        h('span', { style: s.name }, w.name || w.file),
                        h('span', { style: { ...s.badge, ...badgeColor(w.status) } }, statusText(w.status)),
                      ),
                      w.description ? h('div', { style: s.desc }, w.description) : null,
                      h('div', { style: s.file }, w.file),
                    ),
                  ),
                )
              }),
        ))
      }

      return h('div', { style: s.wrap },
        h('div', { style: s.head },
          h('div', null,
            h('div', { style: s.title }, '工作流'),
            h('div', { style: s.sub }, '滑动开关控制各文件夹 .dsh/workflows/ 中的工作流，即时生效'),
          ),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { style: s.btn, onClick: reloadAll }, '全部重新加载'),
            h('button', { style: s.btn, onClick: () => setTick((t) => t + 1) }, '刷新'),
          ),
        ),
        error ? h('div', { style: s.empty }, error) : null,
        !data && !error ? h('div', { style: s.empty }, '加载中…') : null,
        rows.length === 0 && data && !error ? h('div', { style: s.empty }, '还没有工作流加载报告：打开一个含 .dsh/workflows/ 的文件夹并发一条消息') : null,
        rows,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register(
          { name: 'settings.section', id: 'workflows', order: 5, label: '工作流' },
          (props) => h(WorkflowsPage, props),
        ))
      },
    }
  },
})
