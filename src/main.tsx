import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { Demo } from './dev/Demo'
import { AuthProvider } from './auth/AuthContext'

/**
 * `/?demo` renders the agent surfaces against fixtures — no tenant needed.
 * The global is the same switch for embeds that can't carry a query string.
 */
const isDemo =
  new URLSearchParams(window.location.search).has('demo') ||
  (window as unknown as { __PLUME_DEMO__?: boolean }).__PLUME_DEMO__ === true

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDemo ? (
      <Demo />
    ) : (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    )}
  </StrictMode>,
)
