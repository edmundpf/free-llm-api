import { decode } from 'base-64'
import { createHash, timingSafeEqual } from 'node:crypto'
import { AuthConfig } from '../config'

// Credential checking for the single PWA user. The stored password is base64
// encoded (PWA_PASS), so the plaintext to match is decode(PWA_PASS). Comparisons
// are constant-time to avoid leaking length/content through timing: we hash both
// sides to a fixed-size digest so timingSafeEqual never sees a length mismatch.

const safeEqual = (a: string, b: string): boolean => {
  const ah = createHash('sha256').update(a, 'utf8').digest()
  const bh = createHash('sha256').update(b, 'utf8').digest()
  return timingSafeEqual(ah, bh)
}

export const decodePassword = (encoded: string): string => {
  try {
    return decode(encoded)
  } catch {
    return ''
  }
}

export const verifyCredentials = (
  email: string,
  password: string,
  auth: AuthConfig,
): boolean => {
  if (!auth.email || !auth.passwordEncoded) return false
  const expectedPassword = decodePassword(auth.passwordEncoded)
  if (expectedPassword.length === 0) return false
  const emailOk = safeEqual(email.trim().toLowerCase(), auth.email.trim().toLowerCase())
  const passOk = safeEqual(password, expectedPassword)
  return emailOk && passOk
}
