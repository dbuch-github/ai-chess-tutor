import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BluetoothPairingRequest, BluetoothPairingResponse } from '../../../shared/types'

export function BluetoothPairingDialog({ request, onRespond }: {
  request: BluetoothPairingRequest
  onRespond: (response: BluetoothPairingResponse) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  return (
    <div className="dialog-backdrop" onClick={() => onRespond({ confirmed: false })}>
      <form className="dialog" onClick={event => event.stopPropagation()} onSubmit={event => {
        event.preventDefault()
        onRespond({ confirmed: true, ...(request.kind === 'providePin' ? { pin } : {}) })
      }}>
        <h2>{t('bluetooth.pairingTitle')}</h2>
        <p>{t('bluetooth.pairingDevice', { device: request.deviceId })}</p>
        {request.kind === 'confirmPin' && <p>{t('bluetooth.confirmPin', { pin: request.pin })}</p>}
        {request.kind === 'providePin' && (
          <label>{t('bluetooth.enterPin')}<input type="text" autoFocus value={pin} onChange={event => setPin(event.target.value)} autoComplete="off" /></label>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => onRespond({ confirmed: false })}>{t('settings.cancel')}</button>
          <button type="submit" className="btn primary" disabled={request.kind === 'providePin' && !pin.trim()}>{t('bluetooth.pair')}</button>
        </div>
      </form>
    </div>
  )
}
