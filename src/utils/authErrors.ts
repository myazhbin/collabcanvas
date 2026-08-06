import { AuthErrorCodes } from 'firebase/auth'

export function mapAuthError(err: unknown): string | null {
  switch (readString(err, 'code')) {
    case AuthErrorCodes.POPUP_CLOSED_BY_USER:
    case AuthErrorCodes.EXPIRED_POPUP_REQUEST:
      return null

    case AuthErrorCodes.EMAIL_EXISTS:
      return 'That email already has an account. Sign in instead.'
    case AuthErrorCodes.WEAK_PASSWORD:
      return 'Password must be at least 6 characters.'

    case AuthErrorCodes.INVALID_LOGIN_CREDENTIALS:
      return 'Email or password is incorrect.'
    case AuthErrorCodes.INVALID_PASSWORD:
      return 'Wrong password. Try again.'
    case AuthErrorCodes.USER_DELETED:
      return 'No account with that email yet. Create one below.'
    case AuthErrorCodes.INVALID_EMAIL:
      return 'That is not a valid email address.'
    case AuthErrorCodes.MISSING_PASSWORD:
      return 'Enter your password.'
    case AuthErrorCodes.USER_DISABLED:
      return 'That account has been disabled.'
    case AuthErrorCodes.TOO_MANY_ATTEMPTS_TRY_LATER:
      return 'Too many attempts. Wait a minute, then try again.'

    case AuthErrorCodes.POPUP_BLOCKED:
      return 'Your browser blocked the sign-in popup. Allow popups for this site, then try again.'
    case AuthErrorCodes.USER_CANCELLED:
      return 'Google sign-in was cancelled before it finished.'
    case AuthErrorCodes.NEED_CONFIRMATION:
      return 'That email is already registered with a different sign-in method.'

    case AuthErrorCodes.INVALID_ORIGIN:
      return 'This domain is not authorized for sign-in. Add it under Firebase Auth → Authorized domains.'
    case AuthErrorCodes.OPERATION_NOT_ALLOWED:
      return 'That sign-in method is not enabled for this Firebase project.'

    case AuthErrorCodes.NETWORK_REQUEST_FAILED:
      return 'Cannot reach Firebase. Check your connection and try again.'

    default:
      return readString(err, 'message') || 'Something went wrong. Please try again.'
  }
}

function readString(err: unknown, key: 'code' | 'message'): string {
  if (typeof err === 'string') return key === 'message' ? err : ''
  if (typeof err !== 'object' || err === null) return ''

  const value = (err as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}
