import {
  AuthErrorCodes,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { auth } from './firebase'
import { errorCode } from '../utils/errorCode'
import type { DemoAccount } from '../utils/demoAccounts'

export function logIn(email: string, password: string): Promise<User> {
  return signInWithEmailAndPassword(auth, email, password).then((cred) => cred.user)
}

export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(auth, email, password)

  void updateProfile(user, { displayName }).catch((err) => {
    console.warn('updateProfile failed; the captured name still stands for this session', err)
  })

  return user
}

export async function signInAsDemo({ email, password, name }: DemoAccount): Promise<User> {
  try {
    return await logIn(email, password)
  } catch (err) {
    if (!MISSING_ACCOUNT_CODES.has(errorCode(err))) throw err
  }

  try {
    return await signUp(email, password, name)
  } catch (err) {
    if (errorCode(err) === AuthErrorCodes.EMAIL_EXISTS) {
      throw new Error(
        `The ${name} demo account exists with a different password. Reset it in Firebase Auth, or sign in with your own account.`,
      )
    }
    throw err
  }
}

const MISSING_ACCOUNT_CODES = new Set<string>([
  AuthErrorCodes.INVALID_LOGIN_CREDENTIALS,
  AuthErrorCodes.USER_DELETED,
])

export function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()

  provider.setCustomParameters({ prompt: 'select_account' })

  return signInWithPopup(auth, provider).then((cred) => cred.user)
}

export async function logOut(teardown?: () => Promise<void>): Promise<void> {
  try {
    await teardown?.()
  } catch (err) {
    console.warn('presence teardown failed; signing out anyway', err)
  }

  await signOut(auth)
}
