import { useEnv } from '../env'

/** Placeholder until the flag list lands (task 000015). */
export function FlagListPage() {
  const { app, environment } = useEnv()
  return (
    <h1>
      {app.name} flags in {environment.name}
    </h1>
  )
}
