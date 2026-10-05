import { useLocation } from 'react-router'

/** Renders the current URL (path + query) so tests can assert on it. */
export function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}
