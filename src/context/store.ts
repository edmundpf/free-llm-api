import { promises as fs, readFileSync } from 'node:fs'
import { ContextConfig } from '../config'
import { isWritableDirectory } from '../fs/browse'
import { appendInteraction, Interaction } from './transcript'
import { createGitSyncer } from './gitSync'
import { logger } from '../utils/logger'

// Holds the runtime context settings — which folder to write the transcript
// into and whether it's enabled — persisted to a small JSON state file so the
// choice survives restarts. Functional factory (closure over state, no class).

export interface ContextState {
  folder: string | null
  enabled: boolean
}

export interface ContextStore {
  getState: () => ContextState
  setState: (next: { folder?: string | null; enabled?: boolean }) => Promise<ContextState>
  record: (entry: Interaction) => void
}

const loadInitial = (config: ContextConfig): ContextState => {
  try {
    const raw = readFileSync(config.stateFile, 'utf8')
    const parsed = JSON.parse(raw) as Partial<ContextState>
    return {
      folder: typeof parsed.folder === 'string' ? parsed.folder : null,
      enabled: parsed.enabled !== false && !!parsed.folder,
    }
  } catch {
    // No state yet: seed from CONTEXT_DIR if provided.
    const folder = config.defaultDir.length > 0 ? config.defaultDir : null
    return { folder, enabled: folder !== null }
  }
}

export const createContextStore = (config: ContextConfig): ContextStore => {
  let state = loadInitial(config)
  const syncer = createGitSyncer({ enabled: config.gitSync, debounceMs: config.gitDebounceMs })

  const persist = async (): Promise<void> => {
    try {
      await fs.writeFile(config.stateFile, JSON.stringify(state, null, 2), 'utf8')
    } catch (e) {
      logger.warn('could not persist context state', { message: String(e) })
    }
  }

  const getState = (): ContextState => ({ ...state })

  const setState = async (next: {
    folder?: string | null
    enabled?: boolean
  }): Promise<ContextState> => {
    let folder = state.folder
    let enabled = state.enabled
    if (next.folder === null) {
      folder = null
      enabled = false
    } else if (typeof next.folder === 'string') {
      if (!(await isWritableDirectory(next.folder))) {
        throw new Error('folder does not exist or is not writable')
      }
      folder = next.folder
      // Choosing a folder turns recording on unless the caller says otherwise.
      enabled = next.enabled ?? true
    }
    if (next.enabled !== undefined) enabled = next.enabled && folder !== null
    state = { folder, enabled }
    await persist()
    logger.info('context settings updated', { folder: state.folder, enabled: state.enabled })
    return getState()
  }

  // Fire-and-forget: recording context must never block or fail a chat request.
  const record = (entry: Interaction): void => {
    if (!state.enabled || !state.folder) return
    const folder = state.folder
    appendInteraction(folder, entry, config.maxEntries)
      .then(() => syncer.schedule(folder))
      .catch((e) =>
        logger.warn('failed to write context transcript', { folder, message: String(e) }),
      )
  }

  return { getState, setState, record }
}
