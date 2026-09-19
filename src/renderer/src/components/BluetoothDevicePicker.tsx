import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{t('bluetooth.chooseDevice')}</h2>
        <p className="field-hint">{t('bluetooth.multipleFound')}</p>
        <ul className="library-list">
          {devices.map((d) => (
            <li key={d.id} className="library-row">
              <div className="library-info">
                <span className="library-players">{d.name}</span>
              </div>
              <div className="library-actions">
                <button className="btn primary" onClick={() => onSelect(d.id)}>
                  {t('bluetooth.connect')}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button className="btn" onClick={onCancel}>
            {t('settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
