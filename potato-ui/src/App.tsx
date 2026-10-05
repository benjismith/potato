import { Navigate, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { EnvironmentLayout } from './pages/EnvironmentLayout'
import { FlagListPage } from './pages/FlagListPage'
import { NotFound } from './pages/NotFound'
import { StartRedirect } from './pages/StartRedirect'

/**
 * The dashboard's routes. Rendered inside a router: <BrowserRouter> in
 * main.tsx, or <MemoryRouter> in tests.
 */
function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {/* These fill in the first org/app/environment, then redirect. */}
        <Route index element={<StartRedirect />} />
        <Route path="orgs/:orgId" element={<StartRedirect />} />
        <Route path="orgs/:orgId/apps/:appId" element={<StartRedirect />} />

        <Route path="orgs/:orgId/apps/:appId/envs/:envSlug" element={<EnvironmentLayout />}>
          <Route index element={<Navigate to="flags" replace />} />
          <Route path="flags" element={<FlagListPage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default App
