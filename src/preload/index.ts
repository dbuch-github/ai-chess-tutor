import { contextBridge, ipcRenderer } from 'electron'
import type {
  AnalysisConfig,
  AnalysisSnapshot,
  BluetoothDeviceInfo,
  ConfigureResult,
  LibraryGameSummary,
  LibraryLoadResult,
  LibrarySaveResult,
  OpponentConfig,
  PgnExportResult,
  PgnImportResult,
  TutorConfig,
  TutorRequest,
  TutorResult,
  TutorStatus
} from '../shared/types'

const api = {
  /** Öffnet einen http(s)-Link im System-Browser (z. B. Info-Dialog, Einstellungen). */
  openExternal: (url: string): void => ipcRenderer.send('shell:openExternal', url),
  getDefaultEnginePath: (binaryName?: string): Promise<string | null> =>
    ipcRenderer.invoke('engine:defaultPath', binaryName),
  selectFile: (title: string, defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectFile', title, defaultPath),
  getDefaultMaiaWeightsPath: (level?: number): Promise<string> =>
    ipcRenderer.invoke('engine:defaultMaiaWeightsPath', level),
  exportPgn: (pgn: string, suggestedName: string, dialogTitle: string): Promise<PgnExportResult> =>
    ipcRenderer.invoke('pgn:export', pgn, suggestedName, dialogTitle),
  importPgn: (dialogTitle: string): Promise<PgnImportResult> => ipcRenderer.invoke('pgn:import', dialogTitle),
  librarySave: (pgn: string): Promise<LibrarySaveResult> => ipcRenderer.invoke('library:save', pgn),
  libraryList: (): Promise<LibraryGameSummary[]> => ipcRenderer.invoke('library:list'),
  libraryLoad: (filePath: string): Promise<LibraryLoadResult> => ipcRenderer.invoke('library:load', filePath),
  libraryDelete: (filePath: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('library:delete', filePath),
  selectBluetoothDevice: (deviceId: string): void => ipcRenderer.send('bluetooth:select-device', deviceId),
  onBluetoothDeviceList: (callback: (devices: BluetoothDeviceInfo[]) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, devices: BluetoothDeviceInfo[]): void => callback(devices)
    ipcRenderer.on('bluetooth:device-list', listener)
    return () => ipcRenderer.removeListener('bluetooth:device-list', listener)
  },
  configureOpponent: (config: OpponentConfig): Promise<ConfigureResult> =>
    ipcRenderer.invoke('opponent:configure', config),
  configureAnalysis: (config: AnalysisConfig): Promise<ConfigureResult> =>
    ipcRenderer.invoke('analysis:configure', config),
  requestOpponentMove: (movesUci: string[], initialFen?: string): Promise<string> =>
    ipcRenderer.invoke('opponent:move', movesUci, initialFen),
  setAnalysisPosition: (fen: string, movesUci: string[], initialFen?: string): Promise<void> =>
    ipcRenderer.invoke('analysis:position', fen, movesUci, initialFen),
  onAnalysisSnapshot: (callback: (snapshot: AnalysisSnapshot) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, snapshot: AnalysisSnapshot): void =>
      callback(snapshot)
    ipcRenderer.on('analysis:snapshot', listener)
    return () => ipcRenderer.removeListener('analysis:snapshot', listener)
  },
  tutorStatus: (): Promise<TutorStatus> => ipcRenderer.invoke('tutor:status'),
  configureTutor: (config: TutorConfig): Promise<TutorStatus> =>
    ipcRenderer.invoke('tutor:configure', config),
  resetTutor: (): Promise<void> => ipcRenderer.invoke('tutor:reset'),
  requestTutor: (id: number, request: TutorRequest): Promise<TutorResult> =>
    ipcRenderer.invoke('tutor:request', id, request),
  onTutorDelta: (callback: (id: number, delta: string) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, id: number, delta: string): void =>
      callback(id, delta)
    ipcRenderer.on('tutor:delta', listener)
    return () => ipcRenderer.removeListener('tutor:delta', listener)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
