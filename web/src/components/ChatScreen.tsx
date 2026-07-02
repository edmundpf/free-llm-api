import { useEffect, useRef, useState } from 'react'
import { LogOut, Send, Sunset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import SettingsDialog from '@/components/SettingsDialog'
import MessageBubble, { type UiMessage } from '@/components/MessageBubble'
import { AuthError, sendChat, type ChatMessage } from '@/lib/api'

interface Props {
  onLogout: () => void
}

const STORAGE_KEY = 'sunset-llm.messages'

const loadMessages = (): UiMessage[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UiMessage[]) : []
  } catch {
    return []
  }
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const ChatScreen = ({ onLogout }: Props) => {
  const [messages, setMessages] = useState<UiMessage[]>(loadMessages)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Persist the conversation and keep the newest message in view.
  useEffect(() => {
    // Don't store the transient "typing" placeholder.
    const persistable = messages.filter((m) => !m.pending)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistable))
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return

    const userMsg: UiMessage = { id: newId(), role: 'user', content: text }
    const placeholder: UiMessage = { id: newId(), role: 'assistant', content: '', pending: true }
    const history = [...messages, userMsg]
    setMessages([...history, placeholder])
    setDraft('')
    setBusy(true)

    try {
      const payload: ChatMessage[] = history.map((m) => ({ role: m.role, content: m.content }))
      const result = await sendChat(payload)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id
            ? {
                ...m,
                pending: false,
                content: result.content,
                provider: result.provider,
                model: result.model,
                complexity: result.complexity,
              }
            : m,
        ),
      )
    } catch (err) {
      if (err instanceof AuthError) {
        onLogout()
        return
      }
      const message = err instanceof Error ? err.message : 'something went wrong'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholder.id ? { ...m, pending: false, error: true, content: message } : m,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter for a newline (desktop convenience).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const clear = () => {
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="glass sticky top-0 z-10 flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="sunset-gradient flex h-8 w-8 items-center justify-center rounded-lg shadow-md shadow-primary/30">
            <Sunset className="h-4 w-4 text-white" />
          </div>
          <span className="sunset-text text-lg font-bold">Sunset LLM</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={clear} disabled={messages.length === 0}>
            Clear
          </Button>
          <SettingsDialog onAuthError={onLogout} />
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Log out">
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
            <Sunset className="mb-3 h-10 w-10 text-primary/70" />
            <p className="text-base font-medium">Ask anything about your code</p>
            <p className="text-sm">The best free model is picked for each message.</p>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>

      <div className="glass border-t border-border/60 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message…"
            rows={1}
            className="max-h-40 min-h-[44px]"
          />
          <Button
            variant="sunset"
            size="icon"
            onClick={() => void send()}
            disabled={busy || draft.trim().length === 0}
            aria-label="Send"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default ChatScreen
