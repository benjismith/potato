import type { FlagConfig, FlagDetail } from '../api/types'
import { formatValue } from './flagHelpers'
import { Toggle } from './Toggle'
import type { ConfigChangeset } from './useConfigWriter'

interface ConfigPanelProps {
  flag: FlagDetail
  config: FlagConfig
  environmentName: string
  busy: boolean
  onChange: (changes: ConfigChangeset) => void
}

/** A flag's settings in one environment: on/off, and which variations it serves. */
export function ConfigPanel({ flag, config, environmentName, busy, onChange }: ConfigPanelProps) {
  return (
    <div className="form">
      <div className="field-row">
        <span>Enabled in {environmentName}</span>
        <Toggle
          checked={config.enabled}
          label={`Enable ${flag.key}`}
          disabled={busy}
          onChange={(enabled) => onChange({ enabled })}
        />
      </div>

      <label>
        Serve when on
        <VariationSelect
          flag={flag}
          value={config.defaultVariationId}
          disabled={busy}
          onChange={(defaultVariationId) => onChange({ defaultVariationId })}
        />
      </label>

      <label>
        Serve when off
        <VariationSelect
          flag={flag}
          value={config.offVariationId}
          disabled={busy}
          onChange={(offVariationId) => onChange({ offVariationId })}
        />
      </label>

      <p className="muted hint">Version {config.version}</p>
    </div>
  )
}

interface VariationSelectProps {
  flag: FlagDetail
  value: string
  disabled: boolean
  onChange: (variationId: string) => void
}

function VariationSelect({ flag, value, disabled, onChange }: VariationSelectProps) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {flag.variations.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name} ({formatValue(v.value)})
        </option>
      ))}
    </select>
  )
}
