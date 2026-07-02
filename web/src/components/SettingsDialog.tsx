import { useState } from 'react'
import { ArrowUp, Check, Folder, FolderOpen, HardDrive, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AuthError,
  getContextConfig,
  listDir,
  setContextConfig,
  type ContextState,
  type DirListing,
} from '@/lib/api'

interface Props {
  onAuthError: () => void
}

// Server-side folder picker. The gateway (running on the user's machine) lists
// its own directories; the PWA just drives the navigation and saves the choice.
// The selected folder is where the transcript is written so Claude can read it.
const SettingsDialog = ({ onAuthError }: Props) => {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<ContextState | null>(null)
  const [listing, setListing] = useState<DirListing | null>(null)
  const [pathInput, setPathInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const guard = (err: unknown) => {
    if (err instanceof AuthError) {
      setOpen(false)
      onAuthError()
      return true
    }
    setError(err instanceof Error ? err.message : 'something went wrong')
    return false
  }

  const browse = async (path?: string) => {
    setError(null)
    try {
      const result = await listDir(path)
      setListing(result)
      setPathInput(result.path)
    } catch (err) {
      guard(err)
    }
  }

  const onOpenChange = async (next: boolean) => {
    setOpen(next)
    if (!next) return
    setError(null)
    try {
      const cfg = await getContextConfig()
      setConfig(cfg)
      await browse(cfg.folder ?? undefined)
    } catch (err) {
      guard(err)
    }
  }

  const save = async (patch: { folder?: string | null; enabled?: boolean }) => {
    setBusy(true)
    setError(null)
    try {
      setConfig(await setContextConfig(patch))
    } catch (err) {
      guard(err)
    } finally {
      setBusy(false)
    }
  }

  const atRoots = listing !== null && listing.path === ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings2 className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="sunset-text">Context folder</DialogTitle>
          <DialogDescription>
            Pick a folder on the gateway machine. Your prompts here get written to{' '}
            <code className="text-foreground">llm-context/</code> inside it so Claude can see them.
          </DialogDescription>
        </DialogHeader>

        {/* Current selection */}
        <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Current</span>
            {config?.folder && (
              <button
                className="text-xs text-primary hover:underline disabled:opacity-50"
                onClick={() => save({ enabled: !config.enabled })}
                disabled={busy}
              >
                {config.enabled ? 'On' : 'Off'}
              </button>
            )}
          </div>
          <div className="mt-1 break-all font-medium">
            {config?.folder ?? <span className="text-muted-foreground">none selected</span>}
          </div>
          {config?.folder && (
            <button
              className="mt-2 text-xs text-destructive hover:underline disabled:opacity-50"
              onClick={() => save({ folder: null })}
              disabled={busy}
            >
              Clear folder
            </button>
          )}
        </div>

        {/* Path input */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void browse(pathInput.trim() || undefined)
          }}
        >
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="Paste a path, e.g. C:\dev\my-repo"
            spellCheck={false}
            autoCapitalize="none"
          />
          <Button type="submit" variant="outline" size="sm">
            Go
          </Button>
        </form>

        {/* Browser */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => browse(listing?.parent ?? undefined)}
              disabled={!listing || listing.parent === null}
            >
              <ArrowUp className="h-4 w-4" />
              Up
            </Button>
            <span className="truncate text-xs text-muted-foreground">
              {atRoots ? 'Drives & shortcuts' : listing?.path}
            </span>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {listing?.entries.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">No subfolders</p>
            )}
            {listing?.entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => browse(entry.path)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/40"
              >
                {atRoots ? (
                  <HardDrive className="h-4 w-4 shrink-0 text-accent" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          variant="sunset"
          size="lg"
          className="w-full"
          disabled={busy || atRoots || !listing}
          onClick={() => listing && save({ folder: listing.path })}
        >
          {config?.folder === listing?.path ? (
            <>
              <Check className="h-5 w-5" /> Using this folder
            </>
          ) : (
            <>
              <FolderOpen className="h-5 w-5" /> Use this folder
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
