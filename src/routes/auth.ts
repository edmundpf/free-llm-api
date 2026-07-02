import { Request, Response } from 'express'
import { AuthConfig } from '../config'
import { verifyCredentials } from '../auth/credentials'
import { signSession } from '../auth/jwt'
import { AuthedRequest } from '../middleware/auth'
import { logger } from '../utils/logger'

// POST /auth/login — exchange PWA_EMAIL + password (matched against
// decode(PWA_PASS)) for a session JWT the PWA stores and reuses.
export const makeLoginHandler = (auth: AuthConfig) =>
  (req: Request, res: Response): void => {
    const body = (req.body || {}) as { email?: unknown; password?: unknown }
    const email = body.email
    const password = body.password
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({
        error: { message: 'email and password are required', type: 'invalid_request_error' },
      })
      return
    }
    if (!verifyCredentials(email, password, auth)) {
      logger.warn('login failed', { email })
      res.status(401).json({
        error: { message: 'invalid email or password', type: 'authentication_error' },
      })
      return
    }
    const session = signSession(email.trim().toLowerCase(), auth)
    logger.info('login succeeded', { email: email.trim().toLowerCase() })
    res.json({ token: session.token, token_type: 'Bearer', expires_at: session.expiresAt })
  }

// GET /auth/me — lets the PWA validate a stored token on startup.
export const makeMeHandler = () =>
  (req: AuthedRequest, res: Response): void => {
    res.json({ email: req.user?.sub })
  }
