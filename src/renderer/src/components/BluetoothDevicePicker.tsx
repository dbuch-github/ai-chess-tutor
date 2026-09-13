import type { BluetoothDeviceInfo } from '../../../shared/types'

interface BluetoothDevicePickerProps {
  devices: BluetoothDeviceInfo[]
  onSelect: (deviceId: string) => void
  onCancel: () => void
}

/**
 * Electron zeigt für Web Bluetooth keinen eigenen Geräteauswahl-Dialog - der
 * Normalfall (genau ein Brett in Reichweite) wird im Main-Prozess automatisch
 * ausgewählt; dieser Dialog kommt nur bei mehreren gleichzeitig erkannten
 * Geräten zum Einsatz.
 */
export function BluetoothDevicePicker({ devices, onSelect, onCancel }: BluetoothDevicePickerProps): React.JSX.Element {
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>Bluetooth-Gerät wählen</h2>
        <p className="field-hint">Mehrere passende Geräte gefunden – welches soll verbunden werden?</p>
        <ul className="library-list">
          {devices.map((d) => (
            <li key={d.id} className="library-row">
              <div className="library-info">
                <span className="library-players">{d.name}</span>
              </div>
              <div className="library-actions">
                <button className="btn primary" onClick={() => onSelect(d.id)}>
                  Verbinden
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  )
}
