import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { logger } from '../utils/logger'

// Optional, env-gated: commit and push the llm-context transcript from the
// chosen folder so Claude on the web (which reads the repo from GitHub) can see
// it. Off by default — a local Claude only needs the working-tree files. Writes
// are debounced so a burst of messages becomes a single commit, and the whole
// thing is best-effort: a missing git repo or remote just logs a warning.

const pexec = promisify(execFile)

interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
}

const runGit = async (cwd: string, args: string[]): Promise<GitResult> => {
  try {
    const { stdout, stderr } = await pexec('git', args, { cwd, timeout: 30_000 })
    return { ok: true, stdout, stderr }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || err.message || '' }
  }
}

export interface GitSyncer {
  schedule: (folder: string) => void
}

export const createGitSyncer = (opts: { enabled: boolean; debounceMs: number }): GitSyncer => {
  const timers = new Map<string, NodeJS.Timeout>()
  // Serialise syncs so overlapping git invocations never race.
  let chain: Promise<void> = Promise.resolve()

  const doSync = async (folder: string): Promise<void> => {
    const add = await runGit(folder, ['add', 'llm-context'])
    if (!add.ok) {
      logger.warn('context git sync: git add failed (not a repo?)', {
        folder,
        detail: add.stderr.slice(0, 200),
      })
      return
    }
    // `diff --cached --quiet` exits non-zero when something is staged.
    const staged = await runGit(folder, ['diff', '--cached', '--quiet'])
    if (staged.ok) return // nothing to commit

    const commit = await runGit(folder, ['commit', '-m', 'chore: update llm-context [skip ci]'])
    if (!commit.ok) {
      logger.warn('context git sync: commit failed', { folder, detail: commit.stderr.slice(0, 200) })
      return
    }
    const push = await runGit(folder, ['push'])
    if (!push.ok) {
      logger.warn('context git sync: push failed', { folder, detail: push.stderr.slice(0, 200) })
      return
    }
    logger.info('context git sync: pushed transcript', { folder })
  }

  const schedule = (folder: string): void => {
    if (!opts.enabled) return
    const existing = timers.get(folder)
    if (existing) clearTimeout(existing)
    timers.set(
      folder,
      setTimeout(() => {
        timers.delete(folder)
        chain = chain.then(() => doSync(folder)).catch(() => undefined)
      }, opts.debounceMs),
    )
  }

  return { schedule }
}
