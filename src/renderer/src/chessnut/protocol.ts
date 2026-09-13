/**
 * Chessnut Air BLE-Protokoll: reine Byte-Kodierung/-Dekodierung, ohne jede
 * Bluetooth-Abhängigkeit (dadurch isoliert testbar).
 *
 * Quelle: die offizielle Protokolldokumentation "Chessnut chess board
 * communications" von Graham O'Neill, gegengeprüft gegen drei unabhängige
 * Open-Source-Implementierungen (paulvonallwoerden/chessnut-air,
 * NSStudent/EasyLinkSwiftSDK, Dash1971/chessnut-maia-cli — alle GPL-3.0),
 * die exakt dieselben Konstanten/Byte-Layouts verwenden.
 */

export type PieceChar = 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'P' | 'N' | 'B' | 'R' | 'Q' | 'K'

/** Feldname (z. B. "e4") -> Figur; leere Felder fehlen einfach als Key. */
export type BoardSnapshot = Partial<Record<string, PieceChar>>

// Zwei GATT-Services: einer für die laufende Stellungs-Übertragung, einer für
// Schreibkommandos + Bestätigungen/Batteriestatus. (Ein dritter Service für
// den "OTB"-Dateitransfer gespeicherter Partien existiert, wird hier nicht
// gebraucht.)
export const CHESSNUT_SERVICE_FEN = '1b7e8261-2877-41c3-b46e-cf057c562023'
export const CHESSNUT_CHAR_BOARD = '1b7e8262-2877-41c3-b46e-cf057c562023'
export const CHESSNUT_SERVICE_OPERATION = '1b7e8271-2877-41c3-b46e-cf057c562023'
export const CHESSNUT_CHAR_WRITE = '1b7e8272-2877-41c3-b46e-cf057c562023'
export const CHESSNUT_CHAR_CONFIRM = '1b7e8273-2877-41c3-b46e-cf057c562023'

/** Wonach beim Scannen gesucht wird ("Chessnut Air" und Varianten). */
export const CHESSNUT_NAME_FILTERS = [{ namePrefix: 'Chessnut' }, { name: 'Smart Chess' }] as const

const BOARD_HEADER = [0x01, 0x24]
const INIT_ACK = [0x23, 0x01, 0x00]
const BATTERY_HEADER = [0x2a, 0x02]

// Wert 0-12 je Nibble -> FEN-Zeichen (0 = leeres Feld). Reihenfolge laut
// offizieller Doku und von allen geprüften Referenzimplementierungen identisch.
const PIECE_BY_CODE: (PieceChar | null)[] = [
  null,
  'q',
  'k',
  'b',
  'p',
  'n',
  'R',
  'P',
  'r',
  'B',
  'N',
  'Q',
  'K'
]

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const FILE_BIT: Record<string, number> = { a: 128, b: 64, c: 32, d: 16, e: 8, f: 4, g: 2, h: 1 }

/** Feld-Reihenfolge der 64 Nibbles im 32-Byte-Paket: H8,G8,F8,...,C1,B1,A1. */
const SQUARE_ORDER: string[] = (() => {
  const order: string[] = []
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 7; file >= 0; file--) {
      order.push(`${FILES[file]}${rank}`)
    }
  }
  return order
})()

/**
 * Dekodiert eine Stellungs-Benachrichtigung (Header 0x01 0x24, danach 32
 * Byte Stellungsdaten, danach 4 weitere - laut Doku unbekannte - Bytes).
 * Liefert null, wenn der Header nicht passt (z. B. eine andere Nachricht auf
 * demselben Kanal).
 */
export function decodeBoardPacket(bytes: Uint8Array): BoardSnapshot | null {
  if (bytes.length < 34 || bytes[0] !== BOARD_HEADER[0] || bytes[1] !== BOARD_HEADER[1]) {
    return null
  }
  const snapshot: BoardSnapshot = {}
  for (let i = 0; i < 32; i++) {
    const byte = bytes[2 + i]
    const lowCode = byte & 0x0f
    const highCode = byte >> 4
    const sq1 = SQUARE_ORDER[i * 2]
    const sq2 = SQUARE_ORDER[i * 2 + 1]
    const piece1 = lowCode <= 12 ? PIECE_BY_CODE[lowCode] : null
    const piece2 = highCode <= 12 ? PIECE_BY_CODE[highCode] : null
    if (piece1) snapshot[sq1] = piece1
    if (piece2) snapshot[sq2] = piece2
  }
  return snapshot
}

export type ConfirmationMessage =
  | { kind: 'initAck' }
  | { kind: 'battery'; percent: number; charging: boolean }
  | { kind: 'unknown'; bytes: number[] }

/** Dekodiert eine Nachricht vom "Bestätigungs"-Kanal (Init-Ack, Batteriestatus, Sonstiges). */
export function decodeConfirmation(bytes: Uint8Array): ConfirmationMessage {
  if (bytes.length >= 3 && bytes[0] === INIT_ACK[0] && bytes[1] === INIT_ACK[1] && bytes[2] === INIT_ACK[2]) {
    return { kind: 'initAck' }
  }
  if (bytes.length >= 3 && bytes[0] === BATTERY_HEADER[0] && bytes[1] === BATTERY_HEADER[1]) {
    const raw = bytes[2]
    return { kind: 'battery', percent: raw & 0x7f, charging: (raw & 0x80) !== 0 }
  }
  return { kind: 'unknown', bytes: Array.from(bytes) }
}

/** Init-Kommando, direkt nach dem Verbindungsaufbau zu senden. */
export function encodeInitCommand(): Uint8Array {
  return Uint8Array.from([0x21, 0x01, 0x00])
}

/** Fragt den Batteriestatus ab; die Antwort kommt asynchron über den Bestätigungs-Kanal. */
export function encodeBatteryQuery(): Uint8Array {
  return Uint8Array.from([0x29, 0x01, 0x00])
}

/**
 * Kodiert einen Signalton-Befehl für den eingebauten Board-Buzzer. Byte-Layout
 * laut Chessnuts eigenem EasyLinkSDK (Funktion `cl_beep`): 0x0b 0x04, danach
 * Frequenz (Hz) und Dauer (ms) je als 16-Bit big-endian – gegengeprüft gegen
 * die Protokoll-Tests von Dash1971/chessnut-maia-cli (Default 1000 Hz/200 ms
 * ergibt exakt die Bytes 0B 04 03 E8 00 C8).
 */
export function encodeBeepCommand(frequencyHz: number, durationMs: number): Uint8Array {
  const freq = clampUint16(frequencyHz)
  const duration = clampUint16(durationMs)
  return Uint8Array.from([0x0b, 0x04, freq >> 8, freq & 0xff, duration >> 8, duration & 0xff])
}

function clampUint16(value: number): number {
  return Math.min(0xffff, Math.max(1, Math.round(value)))
}

/**
 * Kodiert, welche Felder auf dem Brett leuchten sollen (alle anderen gehen
 * aus). Ein leeres Array schaltet alle LEDs ab.
 */
export function encodeLedCommand(squares: Iterable<string>): Uint8Array {
  const rows = new Uint8Array(8) // Index 0 = Reihe 8 (am weitesten weg), Index 7 = Reihe 1
  for (const raw of squares) {
    const square = raw.trim().toLowerCase()
    const file = square[0]
    const rank = Number(square[1])
    if (square.length !== 2 || !(file in FILE_BIT) || !(rank >= 1 && rank <= 8)) continue
    rows[8 - rank] |= FILE_BIT[file]
  }
  return Uint8Array.from([0x0a, 0x08, ...rows])
}
