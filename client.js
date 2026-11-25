/**
 * Deliverables panel — browser half.
 *
 * Registers one right-Sidebar tab type whose page lists the current Session's
 * deliverables, and one guide entry (入口: 交付物) so the page is reachable from
 * the Sidebar's start page. The list itself comes from the Host half's
 * authenticated route, which already dropped process, temporary and tooling
 * script files; this file renders what survived, opens the file in the Sidebar
 * on click, and re-reads while the Session keeps working.
 *
 * Only `react` and the injected Cordis services are used: no Harness Client
 * package is imported, and every visible string comes from this namespace's
 * dictionary.
 */
window.__ModuleLoader__.load({
  id: 'dsh-deliverables-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React

    /** Locale namespace and tab identity. */
    const NS = 'deliverablesPanel'
    const TAB_ID = 'dsh-deliverables-panel/panel'
    const KIND = 'deliverables-panel'
    /** The Host half's listing route. */
    const ROUTE = '/api/deliverables-panel.list'
    /** Re-read cadence while the page is on screen; the Host answers from its cache when nothing changed. */
    const POLL_INTERVAL_MS = 4000
    /** How long a copy outcome or an open failure stays on screen. */
    const FEEDBACK_MS = 1600
    /** Position of the guide card among the other types' entries. */
    const GUIDE_ORDER = 30

    const zh = {
      'guide.title': '交付物',
      'guide.description': '本会话最终交付的文件',
      'tab.title': '交付物',
      'panel.title': '本会话交付物',
      'panel.refresh': '刷新',
      'panel.loading': '正在读取交付物…',
      'panel.error': '读取交付物失败',
      'panel.retry': '重试',
      'panel.empty': '本会话还没有交付物',
      'panel.emptyHint': '交付物指模型用 present 声明、或写入的文档、表格、图片与压缩包。',
      'panel.open': '在侧栏打开 {name}',
      'panel.openFailed': '这个文件暂时无法在侧栏打开，路径可复制',
      'panel.copyPath': '复制完整路径',
      'panel.copied': '已复制',
      'panel.copyFailed': '复制失败',
      'panel.filtered': '另有 {count} 个过程 / 临时 / 脚本文件未列出',
      'panel.truncated': '仅显示最近 {count} 条中的一部分，更早的未显示',
      'panel.stale': '暂时读不到更新，显示的是上一次结果',
      'panel.unit': '个',
    }

    const en = {
      'guide.title': 'Deliverables',
      'guide.description': "This session's final deliverables",
      'tab.title': 'Deliverables',
      'panel.title': 'Session deliverables',
      'panel.refresh': 'Refresh',
      'panel.loading': 'Reading deliverables…',
      'panel.error': 'Could not read deliverables',
      'panel.retry': 'Retry',
      'panel.empty': 'This session has no deliverables yet',
      'panel.emptyHint': 'Deliverables are the documents, sheets, images and archives the model declared with present or wrote itself.',
      'panel.open': 'Open {name} in the sidebar',
      'panel.openFailed': 'This file cannot open in the sidebar right now; its path can be copied',
      'panel.copyPath': 'Copy full path',
      'panel.copied': 'Copied',
      'panel.copyFailed': 'Copy failed',
      'panel.filtered': 'Not listed: {count} process, temporary or script files',
      'panel.truncated': 'Showing the newest entries only; earlier ones are not listed',
      'panel.stale': 'Could not refresh; showing the previous result',
      'panel.unit': 'files',
    }

    const CSS = `
.dsp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.dsp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
  flex: none;
}
.dsp-heading {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsp-count {
  flex: none;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.dsp-action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsp-action:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dsp-action:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsp-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.dsp-row {
  display: flex;
  align-items: center;
  border-radius: 8px;
}
.dsp-row:hover,
.dsp-row:focus-within {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
}
.dsp-open {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsp-open:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dsp-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  overflow: hidden;
}
.dsp-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsp-name {
  font-size: 13px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsp-sub {
  font-size: 12px;
  line-height: 1.35;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsp-copy {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 4px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: 0;
}
.dsp-row:hover .dsp-copy,
.dsp-copy:focus-visible,
.dsp-copy[data-state] {
  opacity: 1;
}
.dsp-copy:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
}
.dsp-copy:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: -1px;
}
.dsp-copy[data-state="copied"] {
  color: var(--dsw-alias-state-success-primary);
  opacity: 1;
}
.dsp-copy[data-state="failed"] {
  color: var(--dsw-alias-state-error-primary);
  opacity: 1;
}
.dsp-note {
  padding: 18px 14px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.dsp-empty {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 20px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.dsp-empty strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dsp-failure {
  color: var(--dsw-alias-state-error-primary);
}
.dsp-retry {
  margin-top: 2px;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.dsp-retry:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.dsp-foot {
  flex: none;
  padding: 6px 12px 9px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsp-notice {
  color: var(--dsw-alias-state-error-primary);
}
.dsp-foot-note {
  padding: 8px 6px 2px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.5;
}
.dsp-foot-stale {
  color: var(--dsw-alias-state-warn-primary);
}
@media (hover: none) {
  .dsp-copy { opacity: 1; }
}
`

    /**
     * The guide card's glyph.
     * @param props - IconProps supplied by the Sidebar; only `size` is read.
     * @returns a sheet of delivered pages.
     */
    function GuideGlyph(props) {
      const size = props !== null && typeof props === 'object' && Number.isFinite(props.size) ? props.size : 16
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('path', { d: 'M5.1 2.2h3.9l2.2 2.2v3.4' }),
        h('path', { d: 'M9 2.4v2.3h2.3' }),
        h('path', { d: 'M5.1 2.2A.9.9 0 0 0 4.2 3v8.9' }),
        h('path', { d: 'M6.6 10.2h6.4a.8.8 0 0 1 .8.8v2a.8.8 0 0 1-.8.8H6.6a.8.8 0 0 1-.8-.8v-2a.8.8 0 0 1 .8-.8z' }),
        h('path', { d: 'M9.9 12.2h1.9' }),
      )
    }

    /** A small refresh glyph for the header control. */
    function RefreshGlyph() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7' }),
        h('path', { d: 'M13.2 2.6v2.9h-2.9' }),
      )
    }

    /** The row-level copy glyph. */
    function CopyGlyph() {
      return h('svg', {
        width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('rect', { x: 5.6, y: 5.6, width: 7.4, height: 7.4, rx: 1.6 }),
        h('path', { d: 'M10.4 3.2H4.4a1.2 1.2 0 0 0-1.2 1.2v6' }),
      )
    }

    /** The settled-copy glyph. */
    function CheckGlyph() {
      return h('svg', {
        width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      }, h('path', { d: 'M3.2 8.6 6.3 11.7 12.8 4.6' }))
    }

    /** The failed-copy glyph. */
    function AlertGlyph() {
      return h('svg', {
        width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: 'false',
      },
        h('path', { d: 'M8 3.4v5.2' }),
        h('path', { d: 'M8 11.6v.6' }),
      )
    }

    /** The trailing-segment label a row shows as its title. */
    function baseName(path) {
      const normalized = String(path).replace(/\\/g, '/')
      const at = normalized.lastIndexOf('/')
      return at === -1 ? normalized : normalized.slice(at + 1)
    }

    /** The uppercase extension badge text. */
    function extensionOf(name) {
      const dot = name.lastIndexOf('.')
      if (dot <= 0 || dot === name.length - 1) return 'FILE'
      return name.slice(dot + 1).toUpperCase().slice(0, 4)
    }

    /** Where the file sits, shown relative to the Session working directory when possible. */
    function directoryOf(path, cwd) {
      const normalized = String(path).replace(/\\/g, '/')
      const at = normalized.lastIndexOf('/')
      const directory = at === -1 ? '' : normalized.slice(0, at)
      const root = typeof cwd === 'string' ? cwd.replace(/\\/g, '/').replace(/\/+$/, '') : ''
      if (root !== '' && directory.toLowerCase().startsWith(root.toLowerCase())) {
        const relative = directory.slice(root.length).replace(/^\/+/, '')
        return relative === '' ? '.' : relative
      }
      return directory === '' ? normalized : directory
    }

    /**
     * Whether a re-read carries nothing new. Keeping the previous reference when
     * it does stops the four-second poll from re-rendering rows under the
     * pointer and from dropping a row's hover state.
     * @param left - the listing already on screen.
     * @param right - the listing just read.
     * @returns true when the two list the same deliveries.
     */
    function sameListing(left, right) {
      if (left === right) return true
      if (left === null || left === undefined || right === null || right === undefined) return false
      if (left.hidden !== right.hidden || left.cwd !== right.cwd) return false
      if (left.truncated !== right.truncated) return false
      const before = left.files
      const after = right.files
      if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return false
      for (let index = 0; index < before.length; index += 1) {
        if (before[index].address !== after[index].address) return false
        if (before[index].description !== after[index].description) return false
        if (before[index].source !== after[index].source) return false
      }
      return true
    }

    /**
     * One tab's page: the Session's deliverables with open and copy actions.
     * @param props - framework props: the Session, the tab hook, and this namespace's copy.
     * @returns the ranked deliverable list, or the state that stands in for it.
     */
    function DeliverablesPanel(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const sessionId = props.sessionId
      const info = typeof props.useTabInfo === 'function' ? props.useTabInfo() : undefined
      const tab = info !== undefined && info !== null ? info.tab : undefined
      // The body is kept mounted, so visibility decides whether to poll at all.
      const visible = tab === undefined || tab.visible !== false
      const [listing, setListing] = useState(null)
      const [failed, setFailed] = useState(false)
      const [copyState, setCopyState] = useState(null)
      const [notice, setNotice] = useState('')
      const [revision, setRevision] = useState(0)

      useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId === '') return undefined
        let cancelled = false
        let sequence = 0
        const load = async () => {
          const mine = ++sequence
          try {
            const response = await fetch(`${ROUTE}?sessionId=${encodeURIComponent(sessionId)}`, {
              headers: { accept: 'application/json' },
            })
            if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
            const value = await response.json()
            if (cancelled || mine !== sequence) return
            if (value === null || typeof value !== 'object' || !Array.isArray(value.files)) {
              throw new Error('Unexpected listing')
            }
            setListing(current => (sameListing(current, value) ? current : value))
            setFailed(false)
          } catch {
            if (cancelled || mine !== sequence) return
            setFailed(true)
          }
        }
        void load()
        if (!visible) return () => { cancelled = true }
        const timer = setInterval(() => {
          if (typeof document === 'undefined' || document.hidden !== true) void load()
        }, POLL_INTERVAL_MS)
        return () => {
          cancelled = true
          clearInterval(timer)
        }
      }, [sessionId, visible, revision])

      const openFile = (file) => {
        const actions = tab === undefined ? undefined : tab.actions
        if (actions === undefined || actions === null || typeof actions.openResource !== 'function') {
          setNotice(t('panel.openFailed'))
          return
        }
        try {
          actions.openResource(file.address)
          setNotice('')
        } catch {
          // An address nothing claims throws; the path is still selectable and copyable.
          setNotice(t('panel.openFailed'))
        }
      }

      const copyPath = async (path) => {
        try {
          await navigator.clipboard.writeText(path)
          setCopyState({ path, status: 'copied' })
          setTimeout(() => {
            setCopyState(current => (current !== null && current.path === path ? null : current))
          }, FEEDBACK_MS)
        } catch {
          setCopyState({ path, status: 'failed' })
          setTimeout(() => {
            setCopyState(current => (current !== null && current.path === path ? null : current))
          }, FEEDBACK_MS)
        }
      }

      const files = listing !== null && listing !== undefined && Array.isArray(listing.files) ? listing.files : []
      const hidden = listing !== null && listing !== undefined && Number.isFinite(listing.hidden) ? listing.hidden : 0
      const truncated = listing !== null && listing !== undefined && Number.isFinite(listing.truncated) ? listing.truncated : 0
      const cwd = listing !== null && listing !== undefined ? listing.cwd : undefined

      let body
      if (listing === null || listing === undefined) {
        body = failed
          ? h('div', { className: 'dsp-empty' },
            h('strong', { className: 'dsp-failure' }, t('panel.error')),
            h('button', {
              type: 'button', className: 'dsp-retry',
              onClick: () => { setRevision(current => current + 1) },
            }, t('panel.retry')))
          : h('div', { className: 'dsp-note' }, t('panel.loading'))
      } else if (files.length === 0) {
        body = h('div', { className: 'dsp-empty' },
          h('strong', null, t('panel.empty')),
          h('span', null, t('panel.emptyHint')))
      } else {
        const rows = files.map(file => {
          const name = baseName(file.path)
          const description = typeof file.description === 'string' ? file.description.trim() : ''
          const subtitle = description !== '' ? description : directoryOf(file.path, cwd)
          const state = copyState !== null && copyState.path === file.path ? copyState.status : undefined
          const copyLabel = state === 'copied' ? t('panel.copied')
            : state === 'failed' ? t('panel.copyFailed') : t('panel.copyPath')
          const canOpen = tab !== undefined && tab.actions !== undefined
            && typeof tab.actions.openResource === 'function'
          return h('div', { key: file.address, className: 'dsp-row', 'data-deliverable': file.source },
            h('button', {
              type: 'button', className: 'dsp-open', title: file.path,
              'aria-label': t('panel.open', { name }),
              'aria-disabled': canOpen ? undefined : 'true',
              onClick: () => { openFile(file) },
            },
              h('span', { className: 'dsp-badge', 'aria-hidden': true }, extensionOf(name)),
              h('span', { className: 'dsp-text' },
                h('span', { className: 'dsp-name' }, name),
                h('span', { className: 'dsp-sub' }, subtitle)),
            ),
            h('button', {
              type: 'button', className: 'dsp-copy',
              title: copyLabel, 'aria-label': copyLabel,
              'data-state': state,
              onClick: () => { void copyPath(file.path) },
            }, state === 'copied' ? CheckGlyph() : state === 'failed' ? AlertGlyph() : CopyGlyph()),
          )
        })
        if (truncated > 0) {
          rows.push(h('div', { key: 'truncated', className: 'dsp-foot-note' }, t('panel.truncated', { count: String(truncated) })))
        }
        body = h('div', { className: 'dsp-list' }, rows)
      }

      const showFooter = hidden > 0 || notice !== '' || (failed && files.length > 0)
      return h('div', { className: 'dsp-root', 'data-deliverables-panel': true, 'data-state': failed ? 'failed' : 'ready' },
        h('style', { 'data-deliverables-panel-style': true }, CSS),
        h('div', { className: 'dsp-head' },
          h('span', { className: 'dsp-heading' }, t('panel.title')),
          h('span', { className: 'dsp-count', title: `${String(files.length)} ${t('panel.unit')}` }, String(files.length)),
          h('button', {
            type: 'button', className: 'dsp-action',
            title: t('panel.refresh'), 'aria-label': t('panel.refresh'),
            onClick: () => { setRevision(current => current + 1) },
          }, RefreshGlyph())),
        body,
        showFooter
          ? h('div', { className: 'dsp-foot' },
            notice !== '' ? h('span', { className: 'dsp-notice', role: 'status' }, notice) : null,
            hidden > 0 ? h('span', null, t('panel.filtered', { count: String(hidden) })) : null,
            failed && files.length > 0 ? h('span', { className: 'dsp-foot-stale', role: 'status' }, t('panel.stale')) : null)
          : null)
    }

    return {
      // `sidebarRightTabs` publishes the tab-type registry, `slots` carries the
      // body seat, and `locale` owns this namespace's dictionary.
      inject: ['slots', 'locale', 'sidebarRightTabs'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'deliverables-panel: zh dictionary')
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'deliverables-panel: en dictionary')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: KIND,
          // Keeping the visited body mounted holds the list and its scroll
          // position across tab switches; the body itself stops polling while
          // the Sidebar is collapsed or another tab is showing.
          keepMounted: true,
          title: () => t('tab.title'),
          guide: [{
            id: 'deliverables',
            order: GUIDE_ORDER,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: GuideGlyph,
          }],
        }), 'deliverables-panel: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
        }, DeliverablesPanel)), 'deliverables-panel: tab body')
      },
    }
  },
})