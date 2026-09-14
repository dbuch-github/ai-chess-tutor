import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EngineManager } from './engine/EngineManager'
import { TutorService } from './tutor/TutorService'
import { libraryDelete, libraryList, libraryLoad, librarySave } from './library'
import type {
  AnalysisConfig,
  BluetoothDeviceInfo,
  OpponentConfig,
  PgnExportResult,
  PgnImportResult,
  TutorConfig,
  TutorRequest
} from '../shared/types'

let mainWindow: BrowserWindow | null = null

// Web Bluetooth (navigator.bluetooth im Renderer, z. B. für den Chessnut Air)
// zeigt in Electron keinen eigenen Geräteauswahl-Dialog - ohne diesen Handler
// würde requestDevice() für immer hängen. Bei genau einem passenden Gerät
// (der Normalfall bei einem einzelnen Brett) wählen wir es automatisch aus;
// bei mehreren reicht der Renderer die Auswahl über eine eigene UI zurück.
let pendingBluetoothCallback: ((deviceId: string) => void) | null = null

const engines = new EngineManager((snapshot) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('analysis:snapshot', snapshot)
  }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 600,
    title: 'AI Chess Tutor',
    backgroundColor: '#1e2124',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault()
    if (deviceList.length === 1) {
      callback(deviceList[0].deviceId)
      return
    }
    if (deviceList.length > 1) {
      pendingBluetoothCallback = callback
      mainWindow?.webContents.send(
        'bluetooth:device-list',
        deviceList.map((d): BluetoothDeviceInfo => ({ id: d.deviceId, name: d.deviceName || 'Unbekanntes Gerät' }))
      )
      return
    }
    // Noch kein Treffer - Electron scannt weiter, solange der Callback nicht aufgerufen wird
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

/** Sucht ein Kommandozeilen-Binary an den üblichen Homebrew-/System-Pfaden. */
function detectEnginePath(binaryName: string): Promise<string | null> {
  const candidates = [
    `/opt/homebrew/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    `/usr/bin/${binaryName}`
  ]
  const found = candidates.find((p) => existsSync(p))
  if (found) return Promise.resolve(found)
  return new Promise((resolve) => {
    execFile('which', [binaryName], (err, stdout) => {
      resolve(err ? null : stdout.trim() || null)
    })
  })
}

async function selectFile(title: string, defaultPath?: string): Promise<string | null> {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    defaultPath: defaultPath && existsSync(defaultPath) ? defaultPath : undefined,
    properties: ['openFile']
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

/**
 * Voreingestellter Pfad zu einer Maia-Gewichtsdatei: im "maia"-Unterordner
 * des App-eigenen userData-Verzeichnisses (dort haben wir die Netze
 * abgelegt). Rein rechnerisch ermittelt statt hartcodiert, damit er auf
 * jedem Rechner/Betriebssystem stimmt – ein wörtliches "~/Library/…" würde
 * von Node nicht expandiert und wäre schlicht ein ungültiger Pfad.
 */
function defaultMaiaWeightsPath(): string {
  return join(app.getPath('userData'), 'maia', 'maia-1200.pb.gz')
}

async function exportPgn(pgn: string, suggestedName: string): Promise<PgnExportResult> {
  if (!mainWindow) return { ok: false, error: 'Kein Fenster verfügbar' }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Partie als PGN speichern',
    defaultPath: suggestedName,
    filters: [{ name: 'PGN', extensions: ['pgn'] }]
  })
  if (result.canceled || !result.filePath) return { ok: false }
  try {
    writeFileSync(result.filePath, pgn, 'utf8')
    return { ok: true, path: result.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function importPgn(): Promise<PgnImportResult> {
  if (!mainWindow) return { ok: false, error: 'Kein Fenster verfügbar' }
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'PGN-Datei importieren',
    properties: ['openFile'],
    filters: [{ name: 'PGN', extensions: ['pgn'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return { ok: false }
  try {
    return { ok: true, pgn: readFileSync(result.filePaths[0], 'utf8') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

app.whenReady().then(() => {
  ipcMain.handle('engine:defaultPath', (_e, binaryName?: string) => detectEnginePath(binaryName || 'stockfish'))
  ipcMain.handle('dialog:selectFile', (_e, title: string, defaultPath?: string) => selectFile(title, defaultPath))
  ipcMain.handle('engine:defaultMaiaWeightsPath', () => defaultMaiaWeightsPath())
  ipcMain.handle('pgn:export', (_e, pgn: string, suggestedName: string) => exportPgn(pgn, suggestedName))
  ipcMain.handle('pgn:import', () => importPgn())
  ipcMain.handle('library:save', (_e, pgn: string) => librarySave(pgn))
  ipcMain.handle('library:list', () => libraryList())
  ipcMain.handle('library:load', (_e, filePath: string) => libraryLoad(filePath))
  ipcMain.handle('library:delete', (_e, filePath: string) => libraryDelete(filePath))
  ipcMain.on('bluetooth:select-device', (_e, deviceId: string) => {
    pendingBluetoothCallback?.(deviceId)
    pendingBluetoothCallback = null
  })
  ipcMain.handle('opponent:configure', (_e, config: OpponentConfig) =>
    engines.configureOpponent(config)
  )
  ipcMain.handle('analysis:configure', (_e, config: AnalysisConfig) =>
    engines.configureAnalysis(config)
  )
  ipcMain.handle('opponent:move', (_e, movesUci: string[], initialFen?: string) =>
    engines.requestOpponentMove(movesUci, initialFen)
  )
  ipcMain.handle('analysis:position', (_e, fen: string, movesUci: string[], initialFen?: string) =>
    engines.setAnalysisPosition(fen, movesUci, initialFen)
  )

  const tutor = new TutorService()
  ipcMain.handle('tutor:status', () => tutor.status())
  ipcMain.handle('tutor:configure', (_e, config: TutorConfig) =>
    tutor.configure(config.provider, config.model, config.apiKey)
  )
  ipcMain.handle('tutor:reset', () => tutor.reset())
  ipcMain.handle('tutor:request', (_e, id: number, request: TutorRequest) =>
    tutor.send(request, (delta) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tutor:delta', id, delta)
      }
    })
  )

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  } else {
    // App lebt ohne Fenster weiter – Suche anhalten, statt im Hintergrund zu rechnen
    engines.pause()
  }
})

app.on('will-quit', (event) => {
  event.preventDefault()
  engines.shutdown().finally(() => app.exit(0))
})
