import jwt from 'jsonwebtoken'
import { AuthConfig } from '../config'

// JWT session helpers. The token is what the PWA stores to stay logged in and
// what every API call must present. Kept as small pure functions.

export interface SessionClaims {
  sub: string
}

export interface IssuedSession {
  token: string
  // Absolute expiry in epoch milliseconds, for the client to schedule re-login.
  expiresAt: number
}

export const signSession = (email: string, auth: AuthConfig): IssuedSession => {
  const options: jwt.SignOptions = {
    expiresIn: auth.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  }
  const token = jwt.sign({ sub: email }, auth.jwtSecret, options)
  const decoded = jwt.decode(token) as { exp?: number } | null
  const expiresAt = decoded?.exp ? decoded.exp * 1000 : 0
  return { token, expiresAt }
}

export const verifySession = (token: string, auth: AuthConfig): SessionClaims | null => {
  try {
    const payload = jwt.verify(token, auth.jwtSecret)
    if (typeof payload === 'object' && payload !== null && typeof payload.sub === 'string') {
      return { sub: payload.sub }
    }
    return null
  } catch {
    return null
  }
}
