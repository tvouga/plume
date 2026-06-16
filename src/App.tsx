import { Loader2 } from 'lucide-react'
import { useAuth } from './auth/AuthContext'
import { isConfigured } from './auth/config'
import { AppShell } from './components/AppShell'
import { Login } from './components/Login'
import { SetupNeeded } from './components/SetupNeeded'

export default function App() {
  const { account, ready } = useAuth()

  // Step 0: the app hasn't been pointed at an Azure registration yet.
  if (!isConfigured) return <SetupNeeded />

  // Step 1: MSAL is still restoring any existing session.
  if (!ready) {
    return (
      <div className="flex min-h-full items-center justify-center bg-paper-soft">
        <Loader2 className="h-6 w-6 animate-spin text-ink-faint" />
      </div>
    )
  }

  // Step 2: signed out vs. signed in.
  return account ? <AppShell /> : <Login />
}
