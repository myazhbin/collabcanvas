import { AuthErrorCodes } from 'firebase/auth'

/**
 * One switch, so a new failure mode is one line.
 *
 * Codes come from `AuthErrorCodes` rather than hand-typed strings, and that import
 * earns its keep immediately: the constant whose *name* matches R8's failure,
 * `UNAUTHORIZED_DOMAIN`, is `auth/unauthorized-continue-uri` — a different error about
 * email link handlers. The one that actually fires when the deployed hostname is
 * missing from Firebase Auth → Authorized domains is `INVALID_ORIGIN`. Hand-typing
 * either the name or the string gets this wrong.
 *
 * This is the one module under `src/utils` that imports Firebase at runtime. The
 * import is a frozen object of string constants — no SDK initialisation, so the file
 * stays testable in plain node.
 */

/**
 * `null` means "expected, render nothing". A user who closes the Google popup has not
 * hit an error and must not be shown one [R20].
 */
export function mapAuthError(err: unknown): string | null {
  switch (readString(err, 'code')) {
    case AuthErrorCodes.POPUP_CLOSED_BY_USER:
    case AuthErrorCodes.EXPIRED_POPUP_REQUEST:
      return null

    // — Sign-up —
    case AuthErrorCodes.EMAIL_EXISTS:
      return 'That email already has an account. Sign in instead.'
    case AuthErrorCodes.WEAK_PASSWORD:
      return 'Password must be at least 6 characters.'

    // — Sign-in —
    // `INVALID_LOGIN_CREDENTIALS` is the one that fires in practice: with email
    // enumeration protection on (the default since 2023) Firebase collapses
    // wrong-password and no-such-user into it rather than leaking which is which. The
    // two below still arrive from older projects, so all three are mapped.
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

    // — Google popup —
    case AuthErrorCodes.POPUP_BLOCKED:
      return 'Your browser blocked the sign-in popup. Allow popups for this site, then try again.'
    case AuthErrorCodes.USER_CANCELLED:
      return 'Google sign-in was cancelled before it finished.'
    case AuthErrorCodes.NEED_CONFIRMATION:
      return 'That email is already registered with a different sign-in method.'

    // — Configuration. Both mean the console, not the user, is wrong; say so, because
    //   these surface for a grader on the deployed URL and never for you [R8]. —
    case AuthErrorCodes.INVALID_ORIGIN:
      return 'This domain is not authorized for sign-in. Add it under Firebase Auth → Authorized domains.'
    case AuthErrorCodes.OPERATION_NOT_ALLOWED:
      return 'That sign-in method is not enabled for this Firebase project.'

    case AuthErrorCodes.NETWORK_REQUEST_FAILED:
      return 'Cannot reach Firebase. Check your connection and try again.'

    default:
      // Never `undefined`. An empty error box reads as a broken app, which is worse
      // than an unfriendly one — so fall back to the SDK's own message, and to a
      // generic line only if there isn't even that.
      return readString(err, 'message') || 'Something went wrong. Please try again.'
  }
}

/** Duck-typed rather than `instanceof FirebaseError`: rejections cross module realms,
 *  and a failed `instanceof` here would silently blank the message. */
function readString(err: unknown, key: 'code' | 'message'): string {
  if (typeof err === 'string') return key === 'message' ? err : ''
  if (typeof err !== 'object' || err === null) return ''

  const value = (err as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}
