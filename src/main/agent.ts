import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import systemPromptAppend from './prompts/system.md?raw'
import { listModels, loadProviders, migratePiSessions, writePiConfig, sessionsDir } from './providers'
import yestionSkillText from './prompts/skill.md?raw'
import { logLine } from './log'

// pi is an ESM-only package; the main bundle is CJS, so load it dynamically.
// (Type-only imports are erased at compile time and are safe.)
type PiSessionEvent = {
  type: string
  assistantMessageEvent?: { type: string; delta?: string }
  error?: string
}

export interface AgentSettings {
  provider: string
  model: string
  apiKey: string
  thinkingLevel?: string
  /** Resume this pi session file (.jsonl) instead of starting a new one. */
  sessionFile?: string
  /** Force a brand new session (used by "New chat"). */
  newSession?: boolean
}

export interface AgentSessionInfo {
  path: string
  id: string
  name?: string
  firstMessage: string
  created: string
  modified: string
  messageCount: number
}

export interface AgentHandle {
  prompt: (text: string, images?: { data: string; mimeType: string }[]) => Promise<void>
  abort: () => Promise<void>
  dispose: () => Promise<void>
  compact: (instructions?: string) => Promise<unknown>
  setThinking: (level: string) => void
  modelLabel: string
  /** pi session file backing this conversation (undefined before the first message). */
  sessionFile: () => string | undefined
  messages: () => unknown[]
  /** Context window of the active model, when known. */
  contextWindow: () => number | null
}

interface PiApi {
  createAgentSession: (opts: Record<string, unknown>) => Promise<{ session: unknown }>
  ModelRuntime: {
    create: (opts?: Record<string, unknown>) => Promise<{
      setRuntimeApiKey: (provider: string, key: string) => Promise<void>
      getModel: (provider: string, id: string) => unknown
      getAvailable: () => Promise<readonly { provider: string; id: string }[]>
    }>
  }
  DefaultResourceLoader: unknown
  getAgentDir: () => string
  SessionManager: {
    inMemory: (cwd?: string) => unknown
    create: (cwd: string, sessionDir?: string, options?: unknown) => unknown
    open: (path: string, sessionDir?: string, cwdOverride?: string) => unknown
    list: (cwd: string, sessionDir?: string) => Promise<
      { path: string; id: string; name?: string; firstMessage: string; created: Date; modified: Date; messageCount: number }[]
    >
  }
}

let piPromise: Promise<PiApi> | null = null
let currentHandle: AgentHandle | null = null

export function getCurrentHandle(): AgentHandle | null {
  return currentHandle
}

/**
 * The models the app offers: exactly what is configured in Yestion's own
 * provider store. pi's built-in catalog (the hundred unusable entries) is never
 * shown and never fetched.
 */
export async function listAvailableModels(): Promise<
  { provider: string; providerName: string; id: string; name: string; contextWindow: number }[]
> {
  return listModels()
}

/** Import providers/keys from ~/.pi/agent on first run (returns the count). */
export async function importPiProviders(): Promise<number> {
  return (await loadProviders()).length
}
function loadPi(): Promise<PiApi> {
  piPromise ??= import('@earendil-works/pi-coding-agent') as Promise<PiApi>
  return piPromise
}

function yestionSystemPrompt(workspaceRoot: string): string {
  return systemPromptAppend.replaceAll('{{WORKSPACE_ROOT}}', workspaceRoot)
}

// The Yestion skill: seeded at .pi/skills/yestion/SKILL.md *only when missing*,
// so the user can tune it without the app overwriting their edits. The text
// lives in src/main/prompts/skill.md.
const YESTION_SKILL_TEXT = yestionSkillText

/** Recent conversations for this workspace, newest first. */
export async function listAgentSessions(workspaceRoot: string): Promise<AgentSessionInfo[]> {
  const pi = await loadPi()
  try {
    // One-time: bring any conversations from a ~/.pi setup across, so resuming
    // still works for people who used the pi CLI in this workspace.
    await migratePiSessions(workspaceRoot)
    const sessions = await pi.SessionManager.list(workspaceRoot, sessionsDir(workspaceRoot))
    return sessions
      .filter((s) => s.messageCount > 0)
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      .slice(0, 40)
      .map((s) => ({
        path: s.path,
        id: s.id,
        name: s.name,
        firstMessage: (s.firstMessage ?? '')
          .replace(/^\[User is viewing the page[^\]]*\]\s*/, '')
          .replace(/\s+/g, ' ')
          .slice(0, 140),
        created: new Date(s.created).toISOString(),
        modified: new Date(s.modified).toISOString(),
        messageCount: s.messageCount
      }))
  } catch (err) {
    // An error here used to look identical to "no conversations yet", which
    // hides real faults from whoever is looking at the picker.
    void logLine(`agent sessions: listing failed: ${String((err as Error)?.message ?? err)}`, 'error')
    return []
  }
}

/**
 * Read a stored conversation as renderable messages.
 *
 * Parsed straight from the session JSONL (rather than through SessionManager,
 * which loaded nothing for the currently-open session) and image payloads are
 * replaced with a placeholder so the IPC payload stays small.
 */
export async function readAgentSessionMessages(sessionPath: string): Promise<unknown[]> {
  try {
    const raw = await fs.readFile(sessionPath, 'utf-8')
    const entries: { type?: string; id?: string; parentId?: string | null; message?: unknown }[] = []
    for (const line of raw.split('\n')) {
      const text = line.trim()
      if (!text) continue
      try {
        entries.push(JSON.parse(text))
      } catch {
        /* skip malformed line */
      }
    }
    if (entries.length === 0) return []
    const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id as string, e]))
    const parentIds = new Set(entries.map((e) => e.parentId).filter(Boolean) as string[])
    // The active branch is the chain from the newest leaf back to the root.
    let leaf = [...entries].reverse().find((e) => e.id && !parentIds.has(e.id))
    const chain: typeof entries = []
    const guard = new Set<string>()
    while (leaf) {
      chain.push(leaf)
      if (!leaf.id || guard.has(leaf.id)) break
      guard.add(leaf.id)
      leaf = leaf.parentId ? byId.get(leaf.parentId) : undefined
      if (!leaf) break
    }
    chain.reverse()
    return chain.filter((e) => e.type === 'message' && e.message).map((e) => stripImageData(e.message))
  } catch (err) {
    // A session file that does not exist yet (the agent has not written its
    // first message) is normal, not an error worth logging loudly.
    const code = (err as NodeJS.ErrnoException)?.code
    if (code !== 'ENOENT') {
      void logLine(`agent session read failed (${sessionPath}): ${String((err as Error)?.message ?? err)}`, 'error')
    }
    return []
  }
}

function stripImageData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripImageData)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'data' && typeof v === 'string' && v.length > 512) continue
      out[k] = stripImageData(v)
    }
    return out
  }
  return value
}

export async function startAgentSession(
  workspaceRoot: string,
  settings: AgentSettings,
  authDir: string,
  onEvent: (event: PiSessionEvent) => void
): Promise<AgentHandle> {
  const pi = await loadPi()
  // Share the user's existing pi credentials/model configs (so Yestion's agent
  // uses the same providers, keys and models as their terminal pi). Yestion's
  // own BYOK settings act as an override when set.
  // pi is fed from Yestion's own provider store (userData/agent/…): our
  // providers, our models, our keys. No catalog refresh, no ~/.pi dependency.
  const piConfig = await writePiConfig()
  const modelRuntime = await pi.ModelRuntime.create({
    authPath: piConfig.authPath,
    modelsPath: piConfig.modelsPath,
    allowModelNetwork: false,
    refreshOnCreate: false
  })
  void authDir // reserved for future local-only keys
  if (settings.apiKey) {
    await modelRuntime.setRuntimeApiKey(settings.provider, settings.apiKey)
  }

  // Only pin a model when the user explicitly asks; otherwise let pi use its
  // own configured default model from ~/.pi/agent settings.
  const model = settings.model ? modelRuntime.getModel(settings.provider, settings.model) : undefined

  // The yestion skill lives in the workspace itself so pi discovers it like
  // any other skill AND the user can read/edit/tune it in plain files.
  const skillDir = join(workspaceRoot, '.pi', 'skills', 'yestion')
  await fs.mkdir(skillDir, { recursive: true })
  const skillPath = join(skillDir, 'SKILL.md')
  // Seed it once. The comment below the loader promised the user could tune
  // this file, but it was being overwritten on every agent start, which threw
  // away their edits (and any extra conventions they added).
  try {
    await fs.access(skillPath)
  } catch {
    await fs.writeFile(skillPath, YESTION_SKILL_TEXT, 'utf-8')
  }

  const LoaderCtor = pi.DefaultResourceLoader as unknown as new (opts: {
    cwd: string
    agentDir: string
    appendSystemPromptOverride?: (base: string[]) => string[]
  }) => { reload: () => Promise<void> }
  const loader = new LoaderCtor({
    cwd: workspaceRoot,
    agentDir: piConfig.agentDir,
    appendSystemPromptOverride: (base) => [...base, yestionSystemPrompt(workspaceRoot)]
  })
  await loader.reload()

  // Providers support different thinking levels (DeepSeek has no `xhigh`).
  // Asking for one it does not map is how a turn can end up producing nothing,
  // so clamp to the nearest level the configured model actually supports.
  const requestedLevel = (settings.thinkingLevel as string) || 'max'
  let effectiveLevel = requestedLevel
  try {
    const providers = await loadProviders()
    const modelCfg = providers
      .find((p) => p.id === settings.provider)
      ?.models.find((m) => m.id === settings.model)
    const map = modelCfg?.thinkingLevelMap
    if (map && !(requestedLevel in map && map[requestedLevel])) {
      const order = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
      const idx = order.indexOf(requestedLevel)
      let best = ''
      for (let d = 1; d < order.length && !best; d++) {
        for (const cand of [order[idx - d], order[idx + d]]) {
          if (cand && cand in map && map[cand]) {
            best = cand
            break
          }
        }
      }
      if (best) effectiveLevel = best
    }
    if (effectiveLevel !== requestedLevel) {
      console.warn(`[yestion] thinking level ${requestedLevel} → ${effectiveLevel} (${modelCfg?.id ?? 'model'})`)
    }
  } catch {
    /* keep the requested level */
  }

  const sessionOpts: Record<string, unknown> = {
    cwd: workspaceRoot,
    thinkingLevel: effectiveLevel,
    modelRuntime,
    resourceLoader: loader,
    // Sessions persist to the user's pi session dir (~/.pi/agent/sessions/...)
    // so conversations can be listed and resumed here — and with `pi -r` in the
    // terminal, since it's the same format and location.
    sessionManager: settings.newSession
      ? pi.SessionManager.create(workspaceRoot, sessionsDir(workspaceRoot))
      : settings.sessionFile
        ? pi.SessionManager.open(settings.sessionFile, sessionsDir(workspaceRoot))
        : pi.SessionManager.create(workspaceRoot, sessionsDir(workspaceRoot))
  }
  if (model) sessionOpts.model = model
  const { session } = await pi.createAgentSession(sessionOpts)

  const typed = session as {
    sessionFile?: string
    messages?: unknown[]
    model?: { contextWindow?: number }
    subscribe: (fn: (event: PiSessionEvent) => void) => () => void
    prompt: (text: string, options?: { images?: { type: 'image'; data: string; mimeType: string }[] }) => Promise<void>
    abort: () => Promise<void>
    dispose: () => void
  }
  const unsubscribe = typed.subscribe((event) => {
    try {
      onEvent(event)
    } catch {
      // Renderer gone; ignore.
    }
  })

  const handleResult: AgentHandle = {
    modelLabel: model ? `${String((model as { provider: string }).provider)}/${String((model as { id: string }).id)}` : 'pi default',
    prompt: (text, images) =>
      typed.prompt(text, images && images.length > 0 ? { images: images.map((i) => ({ type: 'image' as const, data: i.data, mimeType: i.mimeType })) } : undefined),
    abort: () => typed.abort(),
    compact: (instructions) => (typed as unknown as { compact: (i?: string) => Promise<unknown> }).compact(instructions),
    setThinking: (level) => (typed as unknown as { setThinkingLevel: (l: string) => void }).setThinkingLevel(level),
    sessionFile: () => typed.sessionFile,
    messages: () => typed.messages ?? [],
    contextWindow: () => (typeof typed.model?.contextWindow === 'number' ? typed.model.contextWindow : null),
    dispose: async () => {
      unsubscribe()
      typed.dispose()
      if (currentHandle === handleResult) currentHandle = null
    }
  }
  currentHandle = handleResult
  return handleResult
}
