import { useState } from 'react'
import { Sunset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthError, login } from '@/lib/api'

interface Props {
  onAuthed: () => void
}

const LoginScreen = ({ onAuthed }: Props) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      onAuthed()
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'could not log in, try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm animate-fade-up">
        <CardHeader className="items-center text-center">
          <div className="sunset-gradient mb-2 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg shadow-primary/30">
            <Sunset className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="sunset-text">Sunset LLM</CardTitle>
          <CardDescription>Sign in to start chatting</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="sunset" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default LoginScreen
