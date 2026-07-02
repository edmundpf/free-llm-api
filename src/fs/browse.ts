import { accessSync, constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Server-side directory browsing for the PWA folder picker. The gateway runs on
// the machine that holds the repo (e.g. the user's Windows box), so it is the
// gateway — not the phone's browser — that can enumerate folders. Only
// directories are listed; files are never exposed.

export interface DirEntry {
  name: string
  path: string
}

export interface DirListing {
  // '' represents the virtual "roots" view (drives / home shortcuts).
  path: string
  parent: string | null
  entries: DirEntry[]
}

// Convenient starting points: on Windows the available drive letters plus the
// home directory; on POSIX the filesystem root plus home.
const listRoots = (): DirEntry[] => {
  const roots: DirEntry[] = []
  const home = os.homedir()
  roots.push({ name: `Home (${home})`, path: home })
  if (process.platform === 'win32') {
    for (let code = 65; code <= 90; code++) {
      const drive = `${String.fromCharCode(code)}:\\`
      try {
        accessSync(drive, constants.R_OK)
        roots.push({ name: drive, path: drive })
      } catch {
        // drive not present
      }
    }
  } else {
    roots.push({ name: '/', path: '/' })
  }
  return roots
}

const parentOf = (p: string): string | null => {
  const parent = path.dirname(p)
  // dirname of a root returns the root itself; treat that as "no parent" so the
  // UI can fall back to the roots view.
  return parent === p ? null : parent
}

export const listDirectory = async (target?: string): Promise<DirListing> => {
  if (!target || target.trim().length === 0) {
    return { path: '', parent: null, entries: listRoots() }
  }
  const resolved = path.resolve(target)
  const stat = await fs.stat(resolved)
  if (!stat.isDirectory()) {
    throw new Error('not a directory')
  }
  const dirents = await fs.readdir(resolved, { withFileTypes: true })
  const entries: DirEntry[] = []
  for (const d of dirents) {
    if (!d.isDirectory()) continue
    // Skip hidden/system dot-folders to keep the picker tidy.
    if (d.name.startsWith('.')) continue
    entries.push({ name: d.name, path: path.join(resolved, d.name) })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return { path: resolved, parent: parentOf(resolved), entries }
}

// Validate that a path is an existing, writable directory (for saving as the
// context target).
export const isWritableDirectory = async (target: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(target)
    if (!stat.isDirectory()) return false
    await fs.access(target, constants.W_OK)
    return true
  } catch {
    return false
  }
}
