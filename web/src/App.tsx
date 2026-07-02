import { useEffect, useState } from 'react'
import LoginScreen from '@/components/LoginScreen'
import ChatScreen from '@/components/ChatScreen'
import { checkSession, clearToken } from '@/lib/api'

type Phase = 'loading' | 'login' | 'chat'

const App = () => {
  const [phase, setPhase] = useState<Phase>('loading')

  // On startup, validate any persisted token before showing the chat.
  useEffect(() => {
    checkSession().then((ok) => setPhase(ok ? 'chat' : 'login'))
  }, [])

  const logout = () => {
    clearToken()
    setPhase('login')
  }

  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="sunset-gradient h-10 w-10 animate-pulse rounded-2xl shadow-lg shadow-primary/30" />
      </div>
    )
  }

  return phase === 'chat' ? (
    <ChatScreen onLogout={logout} />
  ) : (
    <LoginScreen onAuthed={() => setPhase('chat')} />
  )
}

export default App
