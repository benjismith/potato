import type { Notice } from './useConfigWriter'

interface NoticeBoxProps {
  notice: Notice | null
  onDismiss: () => void
}

/** Shows a conflict or error message from a config write. */
export function NoticeBox({ notice, onDismiss }: NoticeBoxProps) {
  if (!notice) return null
  return (
    <div className={notice.kind === 'conflict' ? 'notice' : 'error-box'} role="alert">
      <p>{notice.message}</p>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}
