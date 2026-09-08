import {
  PublicClientApplication,
  type Configuration,
  LogLevel,
} from '@azure/msal-browser'

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined
const authoritySegment =
  (import.meta.env.VITE_AZURE_AUTHORITY as string | undefined) || 'organizations'

/** True when the app has been configured with an Azure Client ID. */
export const isConfigured = Boolean(clientId)

/**
 * Microsoft Graph permissions Plume needs. These are *delegated* scopes:
 * the app only ever acts as the signed-in user, never more.
 *   - Mail.ReadWrite : read mail, mark read, move/archive, store the ledger
 *   - Mail.Send      : send and reply
 *   - Calendars.Read : the Runway tethers obligations to real meetings
 *   - User.Read      : the signed-in user's name + photo
 *   - offline_access : stay signed in without re-prompting
 */
export const GRAPH_SCOPES = [
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.Read',
  'offline_access',
]

/**
 * Extra, optional scope to read colleagues' directory photos. Requested at
 * sign-in so it's consented, but NEVER forced mid-session — if it isn't
 * granted, avatars quietly fall back to Gravatar / generated faces.
 */
export const PHOTO_SCOPES = ['User.ReadBasic.All']

export const loginRequest = {
  scopes: [...GRAPH_SCOPES, ...PHOTO_SCOPES],
  prompt: 'select_account',
}

const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? 'unconfigured',
    authority: `https://login.microsoftonline.com/${authoritySegment}`,
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    // Persist across refreshes so the user isn't logged out constantly.
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error('[msal]', message)
      },
      piiLoggingEnabled: false,
    },
  },
}

export const msalInstance = new PublicClientApplication(msalConfig)
