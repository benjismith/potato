import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { LocationProbe } from './LocationProbe'

/** Renders the whole dashboard at `path`, in an in-memory router. */
export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  )
}
