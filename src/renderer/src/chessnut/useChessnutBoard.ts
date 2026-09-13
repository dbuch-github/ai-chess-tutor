import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHESSNUT_CHAR_BOARD,
  CHESSNUT_CHAR_CONFIRM,
  CHESSNUT_CHAR_WRITE,
  CHESSNUT_NAME_FILTERS,
  CHESSNUT_SERVICE_FEN,
  CHESSNUT_SERVICE_OPERATION,
  decodeBoardPacket,
  decodeConfirmation,
  encodeBatteryQuery,
  encodeBeepCommand,
  encodeInitCommand,
  encodeLedCommand,
  type BoardSnapshot
} from './protocol'

export type ChessnutStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ChessnutBattery {
  percent: number
  charging: boolean
}

export interface ChessnutBoardApi {
  status: ChessnutStatus
  error: string | null
  deviceName: string | null
  battery: ChessnutBattery | null
  /** Letzte (entprellte) Stellungs-Momentaufnahme vom physischen Brett. */
  snapshot: BoardSnapshot | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setLeds: (squares: string[]) => Promise<void>
  /** Löst einen kurzen Signalton direkt am Brett aus (Frequenz in Hz, Dauer in ms). */
  beep: (frequencyHz?: number, durationMs?: number) => Promise<void>
}

function isSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth
}

function bytesOf(value: DataView): Uint8Array {
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

/**
 * Verbindet sich per Web-Bluetooth (läuft direkt in Chromium, kein natives
 * Node-Modul nötig) mit einem Chessnut Air und liefert live entschlüsselte
 * Stellungs-Momentaufnahmen. Der Verbindungsaufbau selbst läuft über
 * navigator.bluetooth.requestDevice() – Electron braucht dafür im
 * Main-Prozess einen Handler für das Event "select-bluetooth-device"
 * (siehe src/main/index.ts), sonst hängt das Promise für immer.
 */
export function useChessnutBoard(): ChessnutBoardApi {
  const [status, setStatus] = useState<ChessnutStatus>(isSupported() ? 'disconnected' : 'unsupported')
  const [error, setError] = useState<string | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [battery, setBattery] = useState<ChessnutBattery | null>(null)
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)

  const deviceRef = useRef<BluetoothDevice | null>(null)
  const writeCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null)
  // Letztes tatsächlich gesendetes LED-Muster (sortiert, als Schlüssel) – mehrere
  // Aufrufer (Sync-Hook, Legal-Move-Hints) berechnen bei jeder neuen Brett-Meldung
  // (alle ~200ms) erneut dieselben Felder und riefen bisher bei jedem Tick erneut
  // setLeds auf, auch wenn sich am Zielmuster gar nichts geändert hatte. Das
  // Chessnut-Board zeichnet seine LED-Matrix bei JEDEM Schreibbefehl neu (kurzes
  // Aus-und-wieder-An), was bei minutenlang identisch wiederholten Befehlen als
  // leichtes Flackern/Schwächerwerden sichtbar wird – besonders auffällig bei
  // Schwerfiguren mit vielen (bis zu 27) gleichzeitig leuchtenden Feldern, weil
  // dort am meisten LEDs von diesem Neuzeichnen betroffen sind. Ein unverändertes
  // Muster wird daher gar nicht erst erneut geschrieben.
  const lastSentKeyRef = useRef<string | null>(null)

  const handleBoardNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const decoded = decodeBoardPacket(bytesOf(value))
    if (!decoded) return
    // Bewusst kein Wegfiltern inhaltlich unveränderter Folgemeldungen (das Brett
    // meldet alle ~200ms erneut): useChessnutSync braucht genau zwei
    // aufeinanderfolgende, inhaltlich gleiche Meldungen, um einen erkannten Zug
    // zu bestätigen (Schutz gegen einen einzelnen RFID-Fehlmesswert) - würde
    // hier schon dedupliziert, käme diese zweite Bestätigung nie an.
    setSnapshot(decoded)
  }, [])

  const handleConfirmNotification = useCallback((event: Event) => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value
    if (!value) return
    const msg = decodeConfirmation(bytesOf(value))
    if (msg.kind === 'battery') setBattery({ percent: msg.percent, charging: msg.charging })
  }, [])

  const cleanup = useCallback(() => {
    writeCharRef.current = null
    setSnapshot(null)
    setBattery(null)
    setDeviceName(null)
    // Nach einer Neuverbindung ist der physische LED-Zustand unbekannt (das Board
    // könnte zwischenzeitlich neu gestartet worden sein) – der erste setLeds-Aufruf
    // muss also unabhängig vom zuletzt gemerkten Muster wieder tatsächlich schreiben.
    lastSentKeyRef.current = null
  }, [])

  const setupDevice = useCallback(
    async (device: BluetoothDevice): Promise<void> => {
      deviceRef.current = device
      device.addEventListener('gattserverdisconnected', () => {
        cleanup()
        setStatus('disconnected')
      })

      if (!device.gatt) throw new Error('Gerät unterstützt kein GATT')
      const server = await device.gatt.connect()
      const [fenService, operationService] = await Promise.all([
        server.getPrimaryService(CHESSNUT_SERVICE_FEN),
        server.getPrimaryService(CHESSNUT_SERVICE_OPERATION)
      ])
      const [boardChar, writeChar, confirmChar] = await Promise.all([
        fenService.getCharacteristic(CHESSNUT_CHAR_BOARD),
        operationService.getCharacteristic(CHESSNUT_CHAR_WRITE),
        operationService.getCharacteristic(CHESSNUT_CHAR_CONFIRM)
      ])

      boardChar.addEventListener('characteristicvaluechanged', handleBoardNotification)
      confirmChar.addEventListener('characteristicvaluechanged', handleConfirmNotification)
      await boardChar.startNotifications()
      await confirmChar.startNotifications()

      writeCharRef.current = writeChar
      await writeChar.writeValue(encodeInitCommand() as BufferSource)

      setDeviceName(device.name ?? 'Chessnut Air')
      setStatus('connected')
      setError(null)

      // Batteriestand initial abfragen – das Brett meldet ihn nicht von sich aus laufend.
      writeChar.writeValue(encodeBatteryQuery() as BufferSource).catch(() => {})
    },
    [cleanup, handleBoardNotification, handleConfirmNotification]
  )

  const connect = useCallback(async (): Promise<void> => {
    if (!isSupported()) {
      setStatus('unsupported')
      return
    }
    setStatus('connecting')
    setError(null)
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [...CHESSNUT_NAME_FILTERS],
        optionalServices: [CHESSNUT_SERVICE_FEN, CHESSNUT_SERVICE_OPERATION]
      })
      await setupDevice(device)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [setupDevice])

  const disconnect = useCallback(async (): Promise<void> => {
    const device = deviceRef.current
    if (device?.gatt?.connected) device.gatt.disconnect()
    deviceRef.current = null
    cleanup()
    setStatus('disconnected')
  }, [cleanup])

  // Stilles Wiederverbinden mit einem bereits erlaubten Gerät beim Start (Chromiums
  // persistente Bluetooth-Berechtigungen), ohne den Auswahldialog erneut zu zeigen.
  useEffect(() => {
    // getDevices() ist eine noch nicht überall implementierte Erweiterung von
    // Web Bluetooth (persistente Geräte-Berechtigungen) – anders als der Rest
    // der API kann der Aufruf selbst synchron werfen statt ein Promise
    // zurückzugeben, wenn sie fehlt. Ohne diesen Guard würde das den
    // gesamten Render-Baum zum Absturz bringen statt nur still zu scheitern.
    if (!isSupported() || typeof navigator.bluetooth.getDevices !== 'function') return
    let cancelled = false
    navigator.bluetooth
      .getDevices()
      .then(async (devices) => {
        const known = devices.find((d) => d.name?.startsWith('Chessnut') || d.name === 'Smart Chess')
        if (!known || cancelled) return
        setStatus('connecting')
        try {
          await setupDevice(known)
        } catch (err) {
          if (!cancelled) {
            setStatus('error')
            setError(err instanceof Error ? err.message : String(err))
          }
        }
      })
      .catch(() => {
        // getDevices() ist eine optionale, noch nicht überall unterstützte API –
        // ohne sie bleibt einfach nur das manuelle Verbinden übrig.
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLeds = useCallback(async (squares: string[]): Promise<void> => {
    const writeChar = writeCharRef.current
    if (!writeChar) return
    const key = squares.length === 0 ? '' : squares.slice().sort().join(',')
    if (lastSentKeyRef.current === key) return
    // Sofort (vor dem eigentlichen, asynchronen Schreibvorgang) merken, nicht erst
    // nach dessen Abschluss – sonst würde ein zweiter, praktisch zeitgleicher Aufruf
    // mit demselben Muster (z. B. die nächste ~200ms-Brettmeldung, die eintrifft,
    // während der erste Schreibvorgang noch unterwegs ist) denselben Befehl ein
    // zweites Mal auf die Leitung legen, weil der Vergleich sonst noch den alten
    // Stand sähe. Bei einem Fehlschlag unten wird der Stand zurückgesetzt, damit
    // der nächste identische Aufruf es erneut versucht.
    lastSentKeyRef.current = key
    const payload = encodeLedCommand(squares) as BufferSource
    try {
      // Wie die Referenz-Implementierung (paulvonallwoerden/chessnut-air, dort über
      // noble mit "ohne Antwort" geschrieben) "ohne Antwort" schreiben, wenn
      // verfügbar – schneller als ein Schreiben mit Bestätigungs-Roundtrip und
      // verkleinert das Zeitfenster, in dem sich zwei Schreibvorgänge überlappen
      // könnten. writeValue() (mit Antwort) bleibt der Fallback für Plattformen/
      // Geräte ohne writeValueWithoutResponse.
      if (typeof writeChar.writeValueWithoutResponse === 'function') {
        await writeChar.writeValueWithoutResponse(payload)
      } else {
        await writeChar.writeValue(payload)
      }
    } catch {
      // Best effort – eine einzelne fehlgeschlagene LED-Aktualisierung soll die Partie nicht stören
      lastSentKeyRef.current = null
    }
  }, [])

  // Anders als setLeds bewusst OHNE Dedupe-Schutz gegen identische Wiederholungen –
  // ein Signalton ist ein einmaliges Ereignis (z. B. "Schach"), kein dauerhafter
  // Zustand wie die LEDs, und soll bei jedem Aufruf tatsächlich erklingen, auch mit
  // denselben Parametern wie zuvor.
  const beep = useCallback(async (frequencyHz = 1000, durationMs = 200): Promise<void> => {
    const writeChar = writeCharRef.current
    if (!writeChar) return
    const payload = encodeBeepCommand(frequencyHz, durationMs) as BufferSource
    try {
      if (typeof writeChar.writeValueWithoutResponse === 'function') {
        await writeChar.writeValueWithoutResponse(payload)
      } else {
        await writeChar.writeValue(payload)
      }
    } catch {
      // Best effort – ein einzelner fehlgeschlagener Signalton soll die Partie nicht stören
    }
  }, [])

  return { status, error, deviceName, battery, snapshot, connect, disconnect, setLeds, beep }
}
