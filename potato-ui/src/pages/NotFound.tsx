import { Link } from 'react-router'

export function NotFound() {
  return (
    <main className="app-main">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the dashboard</Link>
      </p>
    </main>
  )
}
