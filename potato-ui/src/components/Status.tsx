interface LoadingProps {
  label?: string
}

/** A small inline "loading" placeholder. */
export function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  )
}

interface ErrorMessageProps {
  error: Error | string
  title?: string
  onRetry?: () => void
}

/** An inline error box, used whenever an API call fails. */
export function ErrorMessage({ error, title = 'Something went wrong', onRetry }: ErrorMessageProps) {
  const message = typeof error === 'string' ? error : error.message
  return (
    <div className="error-box" role="alert">
      <strong>{title}</strong>
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
