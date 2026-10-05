import { createContext, useContext } from 'react'
import type { Me } from './api/tenancy'

/** The current user and their orgs, loaded once by the <Shell>. */
export const MeContext = createContext<Me | null>(null)

export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('useMe() must be used inside <Shell>')
  return me
}
