/**
 * ui-workflow-runs — 右侧「工作流运行」面板（客户端）
 *
 * 挂在 shell.overlay 插槽上：
 *   - 右边缘悬浮箭头：点击展开/收起抽屉面板；
 *   - 抽屉面板：运行中 / 已完成 两组列表，每条带删除按钮、结果预览；
 *   - 运行完成时右上角弹窗，点击打开面板并定位到该运行。
 * 数据来自 /api/workflow-runs，2 秒轮询。
 */
window.__ModuleLoader__.load({
  id: 'dsh-workflow-run-panel',
  factory: (require) => {
    const react = require('react')
    const { createElement: h, useState, useEffect, useCallback, useRef } = react

    const s = {
      arrow: {
        position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
        zIndex: 30, width: 22, minHeight: 72, padding: '6px 2px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        border: '1px solid var(--dsw-alias-border-l2)', borderRight: 'none',
        borderRadius: '10px 0 0 10px', background: 'var(--dsw-alias-button-floating-fill)',
        color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', fontSize: 12, lineHeight: 1.2,
      },
      arrowBadge: {
        background: 'var(--dsw-alias-state-business-primary)', color: '#fff',
        borderRadius: 8, minWidth: 16, height: 16, fontSize: 10, lineHeight: '16px',
        textAlign: 'center', padding: '0 3px',
      },
      drawer: {
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 320, zIndex: 25,
        background: 'var(--dsw-alias-bg-layer-1)', borderLeft: '1px solid var(--dsw-alias-border-l2)',
        display: 'flex', flexDirection: 'column', padding: '14px 14px 20px', overflowY: 'auto',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.12)', fontSize: 13,
      },
      drawerHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
      drawerTitle: { fontSize: 15, fontWeight: 600 },
      closeBtn: { cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', fontSize: 20, lineHeight: 1, padding: '0 4px' },
      sectionTitle: { opacity: 0.65, fontSize: 12, margin: '14px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' },
      empty: { opacity: 0.55, padding: '10px 0', fontSize: 12 },
      card: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8, padding: '9px 10px', marginBottom: 8 },
      row: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
      left: { minWidth: 0, flex: 1 },
      name: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      meta: { opacity: 0.6, fontSize: 11, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      badge: { fontSize: 11, padding: '1px 8px', borderRadius: 10, flexShrink: 0, whiteSpace: 'nowrap' },
      result: { marginTop: 8, borderTop: '1px dashed var(--dsw-alias-border-l2)', paddingTop: 7, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--dsw-alias-label-secondary)' },
      resultLink: { color: 'var(--dsw-alias-state-business-primary)', cursor: 'pointer', fontSize: 12, marginTop: 7 },
      delBtn: { cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-tertiary)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 },
      delBtnHover: { color: 'var(--dsw-alias-state-error-primary)' },
      toast: {
        position: 'fixed', top: 16, right: 16, zIndex: 40, cursor: 'pointer',
        background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', minWidth: 220,
      },
      toastTitle: { fontWeight: 600, fontSize: 13 },
      toastName: { fontSize: 12, marginTop: 4, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      toastHint: { fontSize: 11, marginTop: 6, color: 'var(--dsw-alias-state-business-primary)' },
    }

    const STAGE_NAMES = { 1: '审题', 2: '数据分析', 3: '选用方法', 4: '建模求解', 5: '写作', 6: '自检打磨' }

    function stageLabel(stage) {
      if (!stage || !STAGE_NAMES[stage]) return stage === 0 ? '准备中' : '—'
      return '阶段 ' + stage + ' ' + STAGE_NAMES[stage]
    }
    function timeShort(iso) {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const p = (n) => String(n).padStart(2, '0')
      return p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
    }
    function badgeStyle(status) {
      if (status === 'running') return { background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent)', color: 'var(--dsw-alias-state-business-primary)' }
      if (status === 'completed') return { background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)', color: 'var(--dsw-alias-state-success-primary)' }
      if (status === 'failed') return { background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)', color: 'var(--dsw-alias-state-error-primary)' }
      return { background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-secondary)' }
    }
    function statusText(status) {
      if (status === 'running') return '运行中'
      if (status === 'completed') return '已完成'
      if (status === 'failed') return '失败'
      if (status === 'cancelled') return '已取消'
      return status || '—'
    }

    function post(action, extra) {
      return fetch('/api/workflow-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, extra || {})),
      }).catch(() => null)
    }

    function RunOverlay() {
      const [open, setOpen] = useState(false)
      const [runs, setRuns] = useState([])
      const [toast, setToast] = useState(null)
      const [expanded, setExpanded] = useState({})
      const prevStatus = useRef({})

      useEffect(() => {
        let alive = true
        async function poll() {
          try {
            const r = await fetch('/api/workflow-runs')
            if (!alive || !r.ok) return
            const json = await r.json()
            const list = Array.isArray(json.runs) ? json.runs : []
            for (const run of list) {
              const prev = prevStatus.current[run.id]
              if (prev === 'running' && run.status === 'completed') setToast(run)
              prevStatus.current[run.id] = run.status
            }
            setRuns(list)
          } catch { /* 轮询失败忽略，下轮重试 */ }
        }
        poll()
        const timer = setInterval(poll, 2000)
        return () => { alive = false; clearInterval(timer) }
      }, [])

      const del = useCallback((id) => {
        post('delete', { id })
        setRuns((prev) => prev.filter((r) => r.id !== id))
      }, [])

      const running = runs.filter((r) => r.status === 'running')
      const done = runs.filter((r) => r.status !== 'running')

      const runRow = (run, isDone) => {
        const showResult = expanded[run.id]
        return h('div', { key: run.id, style: s.card },
          h('div', { style: s.row },
            h('div', { style: s.left },
              h('div', { style: s.name }, run.name || '工作流'),
              h('div', { style: s.meta }, (run.target ? run.target + ' · ' : '') + stageLabel(run.stage) + ' · ' + timeShort(run.startedAt)),
            ),
            h('span', { style: { ...s.badge, ...badgeStyle(run.status) } }, statusText(run.status)),
            h('button', { type: 'button', title: '删除', style: s.delBtn, onClick: () => del(run.id) }, '×'),
          ),
          isDone && run.result
            ? (showResult
                ? h('div', { style: s.result }, run.result)
                : h('div', { style: s.resultLink, onClick: () => setExpanded((e) => ({ ...e, [run.id]: true })) }, '查看结果 ▾'))
            : null,
        )
      }

      return h('div', null,
        h('button', { type: 'button', title: '工作流运行', style: s.arrow, onClick: () => setOpen((v) => !v) },
          open ? '▶' : '◀',
          running.length > 0 ? h('span', { style: s.arrowBadge }, String(running.length)) : null,
        ),
        open ? h('div', { style: s.drawer },
          h('div', { style: s.drawerHeader },
            h('span', { style: s.drawerTitle }, '工作流运行'),
            h('button', { type: 'button', style: s.closeBtn, onClick: () => setOpen(false) }, '×'),
          ),
          h('div', { style: s.sectionTitle }, '运行中 · ' + running.length),
          running.length === 0 ? h('div', { style: s.empty }, '暂无运行中的工作流') : running.map((r) => runRow(r, false)),
          h('div', { style: s.sectionTitle }, '已完成 · ' + done.length),
          done.length === 0 ? h('div', { style: s.empty }, '暂无已完成的工作流') : done.map((r) => runRow(r, true)),
        ) : null,
        toast ? h('div', { style: s.toast, onClick: () => { setOpen(true); setExpanded((e) => ({ ...e, [toast.id]: true })); setToast(null) } },
          h('div', { style: s.toastTitle }, '工作流已完成'),
          h('div', { style: s.toastName }, toast.name || '工作流'),
          h('div', { style: s.toastHint }, '点击查看结果 →'),
        ) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: 'workflow-runs', order: 50, label: '工作流' },
          (props) => h(RunOverlay, props),
        ))
      },
    }
  },
})
