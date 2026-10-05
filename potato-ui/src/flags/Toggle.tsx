interface ToggleProps {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

/** An on/off switch (a button with role="switch"). */
export function Toggle({ checked, label, disabled, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
      <span className="toggle-text">{checked ? 'On' : 'Off'}</span>
    </button>
  )
}
