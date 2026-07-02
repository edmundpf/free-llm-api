import { NextFunction, Request, Response } from 'express'
import { AuthConfig } from '../config'
import { verifySession, SessionClaims } from '../auth/jwt'

// Express middleware that requires a valid session JWT (Authorization: Bearer
// <token>). The verified claims are attached to the request for downstream use.

export interface AuthedRequest extends Request {
  user?: SessionClaims
}

export const requireAuth = (auth: AuthConfig) =>
  (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.header('authorization') || ''
    const token = header.replace(/^Bearer\s+/i, '').trim()
    const claims = token ? verifySession(token, auth) : null
    if (!claims) {
      res.status(401).json({
        error: { message: 'authentication required', type: 'authentication_error' },
      })
      return
    }
    req.user = claims
    next()
  }
