import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  InteractionRequiredAuthError,
  type AccountInfo,
} from '@azure/msal-browser'
import { msalInstance, loginRequest, GRAPH_SCOPES, PHOTO_SCOPES } from './config'

interface AuthState {
  account: AccountInfo | null
  ready: boolean
  signIn: () => Promise<void>
  signOut: () => void
  /** Get a fresh Graph access token, prompting only if truly required. */
  getToken: () => Promise<string>
  /** Silent-only token for directory photos; null if the scope isn't granted. */
  getPhotoToken: () => Promise<string | null>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    msalInstance
      .initialize()
      // navigateToLoginRequestUrl:false stops the popup (or returning redirect)
      // from bouncing back to the app's start page — which would otherwise show
      // the login screen again inside the popup instead of completing sign-in.
      .then(() => msalInstance.handleRedirectPromise({ navigateToLoginRequestUrl: false }))
      .then((result) => {
        if (cancelled) return
        const acct =
          result?.account ?? msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null
        if (acct) msalInstance.setActiveAccount(acct)
        setAccount(acct)
      })
      .catch((e) => console.error('[auth] init failed', e))
      .finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  // We use full-page redirect for sign-in (not popups). Popups are fragile:
  // they're blocked in iframes and race with the app reloading inside the
  // popup window. Redirect navigates the whole tab to Microsoft and back —
  // handleRedirectPromise (above) completes it on return.
  const signIn = useCallback(async () => {
    await msalInstance.loginRedirect(loginRequest)
  }, [])

  const signOut = useCallback(async () => {
    const acct = msalInstance.getActiveAccount() ?? undefined
    setAccount(null)
    await msalInstance.logoutRedirect({ account: acct })
  }, [])

  const getToken = useCallback(async () => {
    const acct = msalInstance.getActiveAccount()
    if (!acct) throw new Error('Not signed in')
    try {
      const res = await msalInstance.acquireTokenSilent({
        scopes: GRAPH_SCOPES,
        account: acct,
      })
      return res.accessToken
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError) {
        // Silent renewal failed (e.g. consent needed) — bounce through Microsoft.
        await msalInstance.acquireTokenRedirect({ scopes: GRAPH_SCOPES })
        return '' // page is navigating away
      }
      throw err
    }
  }, [])

  const getPhotoToken = useCallback(async (): Promise<string | null> => {
    const acct = msalInstance.getActiveAccount()
    if (!acct) return null
    try {
      const res = await msalInstance.acquireTokenSilent({
        scopes: PHOTO_SCOPES,
        account: acct,
      })
      return res.accessToken
    } catch {
      // Scope not consented (e.g. signed in before it was added) — skip silently.
      return null
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ account, ready, signIn, signOut, getToken, getPhotoToken }),
    [account, ready, signIn, signOut, getToken, getPhotoToken],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
