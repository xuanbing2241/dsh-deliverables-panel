/**
 * Deliverables panel — Host half.
 *
 * Serves one Session's deliverables over an authenticated `/api` route so the
 * browser half can list them in the right Sidebar. A deliverable is either
 *
 * - a file the model declared through the `present` tool
 *   (the durable `deliverables/presented` Session event), or
 * - a file the model successfully wrote or edited with a first-party mutation
 *   tool (`write`, `edit`, `str_replace_editor`).
 *
 * Everything a working Session leaves behind stays out of the list: only
 * document, data, image and archive types pass the type whitelist, temporary
 * locations and lock/log/backup names are dropped, and a produced file whose
 * name reads like tooling is treated as a process file. A declared file skips
 * that last rule, because an explicit delivery is the model saying "this is the
 * artifact".
 *
 * The answer is cached per Session and invalidated by the live log length, so
 * the browser's poll costs one full read per new event batch and nothing while
 * the Session is quiet.
 */

/** Authenticated route. Exact match below `/api`; query carries the Session. */
const ROUTE = '/api/deliverables-panel.list'

/** Services: the authenticated route carrier, and the live-preferred Session corpus. */
export const inject = ['connection', 'sessionQuery']

/**
 * File types a *produced* file must match to count as a deliverable. Everything
 * absent here is tooling: `.py`, `.ps1`, `.sh`, `.bat`, `.js`, `.ts`, `.json`,
 * `.yaml`, `.log`, `.svg` and the rest of a working directory's intermediates.
 *
 * A `present` declaration is held to a different rule — see {@link SCRIPT_TYPES}.
 */
const DELIVERABLE_TYPES = new Set([
  // Documents and reports
  'md', 'markdown', 'txt', 'rtf', 'pdf', 'epub', 'eml', 'msg',
  // Office
  'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'csv', 'tsv', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  // Query and deployment scripts are deliverables in a database workspace
  'sql',
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff',
  // Archives and media
  'zip', '7z', 'rar', 'tar', 'gz', 'mp4', 'mov', 'mp3', 'wav',
])

/**
 * Executable script types: a working file whose product is another file, never
 * the artifact itself. A `present` declaration still cannot make one of these a
 * deliverable, which is how "脚本文件一律不展示" holds for both sources.
 */
const SCRIPT_TYPES = new Set([
  'py', 'pyc', 'pyo', 'ipynb', 'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'mts', 'cts', 'vbs', 'wsf', 'pl', 'pm', 'rb', 'lua',
  'php', 'go', 'rs', 'java', 'class', 'jar', 'cs', 'c', 'cc', 'cpp', 'cxx', 'h', 'hpp', 'm',
  'swift', 'kt', 'kts', 'scala', 'sqlproj', 'gradle', 'cmake', 'mk', 'make',
])

/**
 * Directory segments that only ever hold intermediates, in normalized spelling:
 * the leading `.`/`_` a workspace adds is stripped before the comparison, so
 * `_tmp`, `.cache`, and `__pycache__` all match their plain names.
 */
const PROCESS_DIRECTORIES = new Set([
  'tmp', 'temp', 'node_modules', 'git', 'cache', 'pycache', 'pytest_cache',
  'venv', 'idea', 'vscode', 'dsh-tmp',
])

/** Name prefixes that mark a lock file, an editor scratch file, or a hidden file. */
const PROCESS_NAME_PREFIXES = ['~$', '.']

/** Name prefixes that mark a generated file the workspace keeps as a working note. */
const PROCESS_NAME_PREFIXES_PRODUCED = ['_']

/** Name suffixes of lock, log, backup and partial-download files. */
const PROCESS_NAME_SUFFIXES = [
  '.tmp', '.temp', '.bak', '.backup', '.log', '.part', '.crdownload', '.download',
  '.swp', '.swo', '.cache', '.orig', '.rej', '.lock',
]

/** Words that mark a generated probe, debug or scratch file rather than an artifact. */
const TOOLING_NAME_WORDS = [
  'probe', 'debug', 'dbg', 'scratch', 'untitled', 'guard', 'playground', 'readme',
  'package-lock', '-copy', '(1)', 'tmp',
]

/** Upper bound on one answer, so a long Session cannot flood the panel. */
const MAX_FILES = 200

/** Sessions whose summarized answer stays cached. */
const MAX_CACHED_SESSIONS = 16

/**
 * Register the listing route for this plugin's lifetime.
 * @param ctx - Host context carrying the route carrier and Session readers.
 */
export function apply(ctx) {
  const cache = new Map()
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'deliverables-panel: lifetime')
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: request => respond(ctx, cache, request, lifetime.signal),
  }), 'deliverables-panel: listing route')
}

/**
 * Answer one listing request.
 * @param ctx - Host context.
 * @param cache - per-Session answer cache.
 * @param request - incoming request; `sessionId` is the only parameter.
 * @param lifetime - aborted when the plugin unloads.
 * @returns the listing, or the status the browser shows as a failure.
 */
async function respond(ctx, cache, request, lifetime) {
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (sessionId === null || sessionId.trim() === '') {
    return new Response('Missing sessionId.', { status: 400 })
  }
  if (lifetime.aborted) return new Response('Deliverables panel is unloading.', { status: 503 })
  try {
    const listing = await listingFor(ctx, cache, sessionId)
    return Response.json(listing, { headers: { 'cache-control': 'no-store' } })
  } catch {
    // An unknown Session, persistence trouble, or a replay rejection are the
    // same thing to the panel: it cannot list deliveries right now.
    return new Response('Deliverables unavailable.', { status: 404 })
  }
}

/**
 * Read one Session's deliveries, reusing the summary while nothing new happened.
 *
 * The corpus cut carries a cursor — its last event sequence — which is the
 * invalidation key: a quiet Session serves the cached answer without
 * materializing its log, and a working Session costs one clone of the events
 * that were appended since the last read.
 * @param ctx - Host context.
 * @param cache - per-Session answer cache.
 * @param sessionId - viewed Session.
 * @returns the listing payload.
 */
async function listingFor(ctx, cache, sessionId) {
  const corpus = await corpusOf(ctx.sessionQuery, sessionId)
  try {
    const cached = cache.get(sessionId)
    if (cached !== undefined && cached.key === corpus.key) return cached.value
    const value = summarize(sessionId, { session: corpus.header, events: corpus.events })
    cache.delete(sessionId)
    cache.set(sessionId, { key: corpus.key, value })
    while (cache.size > MAX_CACHED_SESSIONS) {
      const oldest = cache.keys().next()
      if (oldest.done === true) break
      cache.delete(oldest.value)
    }
    return value
  } finally {
    corpus.dispose()
  }
}

/**
 * The Session's live-preferred log cut, with the key that says whether it moved.
 * @param query - the session query corpus service.
 * @param sessionId - viewed Session.
 * @returns events, header, cache key, and the lease release.
 */
async function corpusOf(query, sessionId) {
  if (typeof query.observeSession === 'function') {
    try {
      // `projectionMode: 'none'` keeps this read to the raw log: the panel
      // derives everything itself and needs no projection work.
      const observation = await query.observeSession(sessionId, { projectionMode: 'none' })
      return {
        key: `${String(observation.source)}:${String(observation.cursor)}`,
        header: observation.header,
        events: Array.isArray(observation.events) ? observation.events : [],
        dispose: () => {
          // The lease holds a retained cut; the panel keeps plain JSON only.
          if (typeof observation.dispose === 'function') observation.dispose()
        },
      }
    } catch {
      // Fall through: a validating read can still answer where the lease cannot.
    }
  }
  const snapshot = await query.readSession(sessionId)
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []
  return {
    key: `read:${String(events.length === 0 ? -1 : Number(events[events.length - 1]?.seq ?? -1))}`,
    header: snapshot?.session,
    events,
    dispose: () => {},
  }
}

/**
 * Fold a Session log into its deliverable list.
 * @param sessionId - the Session whose files are addressed.
 * @param snapshot - complete raw event log and header.
 * @returns the listing payload without the liveness flag.
 */
function summarize(sessionId, snapshot) {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : []
  const header = snapshot?.session
  const cwd = typeof header?.cwd === 'string' && header.cwd !== '' ? header.cwd : undefined
  /** callId -> unresolved mutation path. */
  const mutations = new Map()
  /** resolved path -> entry. */
  const files = new Map()
  /** paths the filter dropped, in resolved form. */
  const filtered = new Set()
  let throughSeq = 0

  for (const event of events) {
    const seq = typeof event?.seq === 'number' ? event.seq : 0
    if (seq > throughSeq) throughSeq = seq
    // A declared delivery: `{ turn, callId, files: [{ path, description? }] }`.
    if (event?.type === 'deliverables/presented') {
      const data = event.data
      const declared = Array.isArray(data?.files) ? data.files : []
      declared.forEach((file, index) => {
        const raw = typeof file?.path === 'string' ? file.path : undefined
        const path = resolvePath(cwd, raw)
        if (path === undefined) return
        if (!admit(path, 'presented')) {
          filtered.add(path)
          return
        }
        record(files, filtered, path, {
          source: 'presented',
          seq,
          index,
          turn: typeof data.turn === 'number' ? data.turn : undefined,
          description: typeof file.description === 'string' && file.description.trim() !== ''
            ? file.description.trim()
            : undefined,
        })
      })
      continue
    }
    // A first-party mutation call remembers its target until the result settles.
    if (event?.type === 'tool/call') {
      const path = mutationPath(event.data?.name, event.data?.arguments)
      if (path !== undefined) mutations.set(String(event.data.callId), path)
      continue
    }
    if (event?.type !== 'tool/result') continue
    const data = event.data
    if (data?.message?.isError === true) continue
    const callId = data?.message?.source?.callId
    if (callId === undefined) continue
    const argument = mutations.get(String(callId))
    if (argument === undefined) continue
    const path = resolvePath(cwd, settledPath(argument, data.meta))
    if (path === undefined) continue
    if (!admit(path, 'produced')) {
      filtered.add(path)
      continue
    }
    record(files, filtered, path, {
      source: 'produced',
      seq,
      index: 0,
      turn: typeof data.turn === 'number' ? data.turn : undefined,
      description: undefined,
    })
  }

  const list = [...files.values()].sort((left, right) =>
    right.seq - left.seq || left.index - right.index || left.path.localeCompare(right.path))
  const shown = list.slice(0, MAX_FILES).map(entry => ({
    path: entry.path,
    address: fileAddress(sessionId, cwd, entry.path),
    source: entry.source,
    seq: entry.seq,
    ...entry.turn === undefined ? {} : { turn: entry.turn },
    ...entry.description === undefined ? {} : { description: entry.description },
  }))
  return {
    sessionId,
    ...cwd === undefined ? {} : { cwd },
    throughSeq,
    ...shown.length === list.length ? {} : { truncated: list.length - shown.length },
    files: shown,
    hidden: filtered.size,
  }
}

/**
 * Add one admitted file, upgrading an earlier produced entry when the same path
 * is declared later and keeping the newest sequence.
 * @param files - resolved path index.
 * @param filtered - filtered path index; an admitted path is never filtered.
 * @param path - resolved path.
 * @param entry - source facts for this declaration.
 */
function record(files, filtered, path, entry) {
  filtered.delete(path)
  const existing = files.get(path)
  if (existing === undefined) {
    files.set(path, { ...entry, path })
    return
  }
  files.set(path, {
    source: existing.source === 'presented' || entry.source === 'presented' ? 'presented' : 'produced',
    seq: Math.max(existing.seq, entry.seq),
    index: Math.max(existing.index, entry.index),
    turn: entry.turn ?? existing.turn,
    description: entry.description ?? existing.description,
    path,
  })
}

/**
 * Whether one path may appear in the panel.
 *
 * Both sources share the location and lock rules. They differ on type: a
 * declared delivery may be any artifact except an executable script, while a
 * merely produced file must match the deliverable whitelist and must not be
 * named like generated tooling.
 * @param path - resolved path.
 * @param source - who named the file.
 * @returns true when the file is a deliverable of this Session.
 */
function admit(path, source) {
  const normalized = path.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(segment => segment !== '')
  const directories = segments.slice(0, -1).map(normalizeSegment)
  for (const directory of directories) {
    if (PROCESS_DIRECTORIES.has(directory)) return false
  }
  const name = (segments[segments.length - 1] ?? '').toLowerCase()
  if (name === '') return false
  for (const prefix of PROCESS_NAME_PREFIXES) {
    if (name.startsWith(prefix)) return false
  }
  for (const suffix of PROCESS_NAME_SUFFIXES) {
    if (name.endsWith(suffix)) return false
  }
  const type = extensionOf(name)
  if (type === undefined) return false
  if (source === 'presented') return !SCRIPT_TYPES.has(type)
  if (!DELIVERABLE_TYPES.has(type)) return false
  for (const prefix of PROCESS_NAME_PREFIXES_PRODUCED) {
    if (name.startsWith(prefix)) return false
  }
  for (const word of TOOLING_NAME_WORDS) {
    if (name.includes(word)) return false
  }
  return true
}

/** A directory name with the leading `.`/`_` a workspace convention adds stripped. */
function normalizeSegment(segment) {
  return segment.toLowerCase().replace(/^[._]+/, '')
}

/**
 * The lowercase extension of the last path segment.
 * @param path - any path; its last segment is read.
 * @returns the extension without its dot, or undefined for a name without one.
 */
function extensionOf(path) {
  const normalized = path.replace(/\\/g, '/')
  const name = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return undefined
  return name.slice(dot + 1)
}

/**
 * The target of one first-party mutation call.
 * @param name - wire tool name.
 * @param raw - the model's raw JSON arguments.
 * @returns the path as submitted, or undefined for any other call.
 */
function mutationPath(name, raw) {
  let args
  try {
    args = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return undefined
  if (name === 'write') {
    return typeof args.content === 'string' ? pathValue(args.file_path) : undefined
  }
  if (name === 'edit') {
    const complete = typeof args.old_string === 'string' && args.old_string !== ''
      && typeof args.new_string === 'string' && args.old_string !== args.new_string
    return complete ? pathValue(args.file_path) : undefined
  }
  if (name !== 'str_replace_editor') return undefined
  const path = pathValue(args.path)
  if (path === undefined) return undefined
  if (args.command === 'create') return typeof args.file_text === 'string' ? path : undefined
  if (args.command === 'str_replace') {
    return typeof args.old_str === 'string' && args.old_str !== '' ? path : undefined
  }
  if (args.command === 'insert') {
    return Number.isInteger(args.insert_line) && args.insert_line >= 0
      && typeof args.new_str === 'string' ? path : undefined
  }
  return undefined
}

/** A non-blank path keeps the exact spelling submitted to the tool. */
function pathValue(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * The path a settled mutation wrote: the recorded absolute target when the tool
 * carried one, otherwise the argument it was called with.
 * @param argumentPath - the submitted path.
 * @param meta - the tool's private result payload.
 * @returns the path to resolve, or undefined when neither form is usable.
 */
function settledPath(argumentPath, meta) {
  if (meta !== null && typeof meta === 'object' && Object.hasOwn(meta, 'path')) {
    if (typeof meta.path === 'string' && isAbsolutePath(meta.path)) return meta.path
    return isAbsolutePath(argumentPath) ? argumentPath : undefined
  }
  return argumentPath
}

/**
 * Resolve a submitted path against the Session working directory.
 * @param cwd - the Session working directory, when the header carries one.
 * @param path - submitted path.
 * @returns the resolved path, or undefined when it cannot be resolved.
 */
function resolvePath(cwd, path) {
  if (typeof path !== 'string') return undefined
  const trimmed = path.trim()
  if (trimmed === '') return undefined
  if (isAbsolutePath(trimmed)) return trimmed
  if (cwd === undefined) return undefined
  const separator = cwd.includes('\\') ? '\\' : '/'
  return `${cwd.replace(/[\\/]+$/, '')}${separator}${trimmed.replace(/^(?:\.?[\\/])+/, '')}`
}

/** Windows drive, POSIX root, or UNC server path. */
function isAbsolutePath(path) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\')
}

/**
 * Build the `dsh-resource://file/…` address the right Sidebar opens, using the
 * Sidebar's own grammar: a file inside the Session workspace is addressed
 * relative to that workspace root — which is also how the Chat's file links
 * address it, so the same file reveals one tab instead of two — and anything
 * else keeps its absolute path in the same Session scope.
 * @param sessionId - the Session that resolves the path.
 * @param cwd - that Session's workspace root, when the header carries one.
 * @param path - resolved path.
 * @returns the resource address.
 */
function fileAddress(sessionId, cwd, path) {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  const root = typeof cwd === 'string' ? cwd.replace(/\\/g, '/').replace(/\/+$/, '') : ''
  let target = normalized
  if (root !== '') {
    if (normalized === root) target = ''
    else if (normalized.startsWith(`${root}/`)) target = normalized.slice(root.length + 1)
  }
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${target.split('/').map(encodeSegment).join('/')}`
}

/** Component-encode one segment, keeping `:` literal for drive letters. */
function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}