import { ipcMain, type BrowserWindow } from 'electron'
import type { BluetoothPairingRequest, BluetoothPairingResponse } from '../shared/types'

let nextPairingId = 1

/** Pairing callbacks are scoped to this window and settled on cancel/close/timeout. */
export function installBluetoothPairing(window: BrowserWindow, platform = process.platform): void {
  if (platform === 'darwin') return
  const session = window.webContents.session
  let pending: { id: number; callback: (response: BluetoothPairingResponse) => void; timer: NodeJS.Timeout } | null = null
  const settle = (response: BluetoothPairingResponse): void => {
    if (!pending) return
    const current = pending
    pending = null
    clearTimeout(current.timer)
    current.callback(response)
    if (!window.isDestroyed()) window.webContents.send('bluetooth:pairing-request', null)
  }
  const respond = (event: Electron.IpcMainEvent, id: number, response: BluetoothPairingResponse): void => {
    if (event.sender !== window.webContents || id !== pending?.id || !response || typeof response !== 'object') return
    settle({ confirmed: response.confirmed === true, pin: typeof response.pin === 'string' ? response.pin : undefined })
  }
  ipcMain.on('bluetooth:pairing-response', respond)
  session.setBluetoothPairingHandler((details, callback) => {
    settle({ confirmed: false })
    const id = nextPairingId++
    pending = { id, callback, timer: setTimeout(() => settle({ confirmed: false }), 120_000) }
    const request: BluetoothPairingRequest = { id, deviceId: details.deviceId, kind: details.pairingKind, pin: details.pin }
    window.webContents.send('bluetooth:pairing-request', request)
  })
  window.once('closed', () => {
    settle({ confirmed: false })
    ipcMain.removeListener('bluetooth:pairing-response', respond)
    // The session outlives windows on macOS/Linux; do not retain a closed window.
    session.setBluetoothPairingHandler(null)
  })
}
