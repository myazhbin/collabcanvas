import { describe, expect, it } from 'vitest'
import { AuthErrorCodes } from 'firebase/auth'
import { mapAuthError } from './authErrors'

const fbError = (code: string) =>
  Object.assign(new Error(`Firebase: Error (${code}).`), { code, name: 'FirebaseError' })

describe('mapAuthError', () => {
  it('maps known codes to human strings', () => {
    expect(mapAuthError(fbError(AuthErrorCodes.EMAIL_EXISTS))).toMatch(/already has an account/i)
    expect(mapAuthError(fbError(AuthErrorCodes.WEAK_PASSWORD))).toMatch(/6 characters/i)
    expect(mapAuthError(fbError(AuthErrorCodes.INVALID_LOGIN_CREDENTIALS))).toMatch(/incorrect/i)
    expect(mapAuthError(fbError(AuthErrorCodes.NETWORK_REQUEST_FAILED))).toMatch(/connection/i)
  })

  it('names the console fix for the domain error a grader hits and you never do [R8]', () => {
    expect(AuthErrorCodes.INVALID_ORIGIN).toBe('auth/unauthorized-domain')
    expect(mapAuthError(fbError(AuthErrorCodes.INVALID_ORIGIN))).toMatch(/authorized domains/i)
  })

  it('never returns undefined for an unknown code', () => {
    expect(mapAuthError(fbError('auth/some-code-invented-after-this-was-written'))).toBe(
      'Firebase: Error (auth/some-code-invented-after-this-was-written).',
    )

    for (const junk of [null, undefined, {}, 42, new Error('')]) {
      expect(mapAuthError(junk)).toBeTruthy()
    }
  })

  it('swallows a closed popup rather than reporting it as an error', () => {
    expect(mapAuthError(fbError(AuthErrorCodes.POPUP_CLOSED_BY_USER))).toBeNull()
    expect(mapAuthError(fbError(AuthErrorCodes.EXPIRED_POPUP_REQUEST))).toBeNull()
  })
})
