import { cn } from '@/lib/utils'

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  provider?: string | null
  model?: string | null
  complexity?: string | null
  pending?: boolean
  error?: boolean
}

interface Props {
  message: UiMessage
}

// A short label naming the provider that served an assistant message, e.g.
// "gemini · gemini-2.0-flash". This is the per-message model footnote.
const footnote = (m: UiMessage): string | null => {
  if (m.role !== 'assistant' || m.pending || m.error) return null
  if (!m.provider && !m.model) return null
  if (m.provider && m.model) return `${m.provider} · ${m.model}`
  return m.provider || m.model || null
}

const MessageBubble = ({ message }: Props) => {
  const isUser = message.role === 'user'
  const note = footnote(message)

  return (
    <div className={cn('flex animate-fade-up flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-md',
          isUser
            ? 'sunset-gradient rounded-br-md text-white shadow-primary/20'
            : 'glass rounded-bl-md border border-border/60 text-foreground',
          message.error && 'border-destructive/60 text-destructive',
        )}
      >
        {message.pending ? (
          <span className="inline-flex gap-1">
            <span className="h-2 w-2 animate-blink rounded-full bg-primary" />
            <span className="h-2 w-2 animate-blink rounded-full bg-accent [animation-delay:200ms]" />
            <span className="h-2 w-2 animate-blink rounded-full bg-secondary-foreground [animation-delay:400ms]" />
          </span>
        ) : (
          message.content
        )}
      </div>
      {note && (
        <span className="mt-1 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {note}
        </span>
      )}
    </div>
  )
}

export default MessageBubble
