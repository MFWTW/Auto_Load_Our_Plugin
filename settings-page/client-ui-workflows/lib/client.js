/**
 * ui-workflows — 设置中的「工作流」页（客户端）
 * 列出工作流加载器上报的加载报告（来自 /api/workflow-registry）。
 */
window.__ModuleLoader__.load({
  id: '@deepseek-ai/dsh-client-ui-workflows',
  factory: (require) => {
    const react = require('react')
    const { createElement: h, useState, useEffect } = react

    const s = {
      wrap: { padding: '16px 20px', fontSize: '13px', lineHeight: '1.6' },
      title: { fontSize: '15px', fontWeight: 600, marginBottom: '6px' },
      sub: { opacity: 0.65, fontSize: '12px', marginBottom: '14px' },
      head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
      btn: {
        fontSize: '12px', cursor: 'pointer', padding: '4px 12px', borderRadius: '6px',
        border: '1px solid rgba(128,128,128,.4)', background: 'transparent', color: 'inherit',
      },
      card: {
        border: '1px solid rgba(128,128,128,.3)', borderRadius: '8px',
        padding: '10px 12px', marginBottom: '8px',
      },
      row: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' },
      name: { fontWeight: 600 },
      desc: { opacity: 0.75, fontSize: '12px', marginTop: '2px' },
      file: { opacity: 0.55, fontSize: '11px', marginTop: '2px', wordBreak: 'break-all' },
      badge: {
        fontSize: '11px', padding: '1px 8px', borderRadius: '10px', flexShrink: 0,
      },
      empty: { opacity: 0.6, padding: '24px 0', textAlign: 'center' },
    }
    const badgeColor = (status) => status === 'loaded'
      ? { background: 'rgba(43,124,43,.18)', color: '#2b7c2b' }
      : status === 'error' || status.startsWith('error')
        ? { background: 'rgba(185,28,28,.15)', color: '#b91c1c' }
        : { background: 'rgba(128,128,128,.18)', color: 'inherit' }
    const statusText = (status) => status === 'loaded' ? '已加载'
      : status === 'already-loaded' ? '已加载过'
      : status.startsWith('error') ? '出错' : status

    function WorkflowsPage() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [tick, setTick] = useState(0)

      useEffect(() => {
        let alive = true
        fetch('/api/workflow-registry')
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
          .then((json) => { if (alive) { setData(json); setError('') } })
          .catch((e) => { if (alive) { setData(null); setError(String(e && e.message || e)) } })
        return () => { alive = false }
      }, [tick])

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
            : list.map((w, i) => h('div', { key: i, style: { marginTop: 8, borderTop: '1px dashed rgba(128,128,128,.25)', paddingTop: 8 } },
                h('div', { style: s.row },
                  h('span', { style: s.name }, w.name || w.file),
                  h('span', { style: { ...s.badge, ...badgeColor(w.status) } }, statusText(w.status)),
                ),
                w.description ? h('div', { style: s.desc }, w.description) : null,
                h('div', { style: s.file }, w.file),
              )),
        ))
      }

      return h('div', { style: s.wrap },
        h('div', { style: s.head },
          h('div', null,
            h('div', { style: s.title }, '工作流'),
            h('div', { style: s.sub }, '来自各工作目录 .dsh/workflows/ 的自动加载报告'),
          ),
          h('button', { style: s.btn, onClick: () => setTick((t) => t + 1) }, '刷新'),
        ),
        error ? h('div', { style: s.empty }, '读取失败：' + error) : null,
        !data && !error ? h('div', { style: s.empty }, '加载中…') : null,
        rows.length === 0 && data && !error ? h('div', { style: s.empty }, '还没有工作流加载报告：先用工作流加载器预设打开一个含 .dsh/workflows/ 的文件夹') : null,
        rows,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('settings.section', () => ctx.slots.register(
          { name: 'settings.section', id: 'workflows', order: 5, label: '工作流' },
          () => h(WorkflowsPage),
        ))
      },
    }
  },
})
