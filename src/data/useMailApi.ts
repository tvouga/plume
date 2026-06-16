import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { createGraph } from '../graph/client'
import { createMailApi, type MailApi } from '../graph/mail'

/** A MailApi bound to the current signed-in user's token. */
export function useMailApi(): MailApi {
  const { getToken } = useAuth()
  return useMemo(() => createMailApi(createGraph(getToken)), [getToken])
}
