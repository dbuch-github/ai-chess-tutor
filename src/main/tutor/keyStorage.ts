interface KeyStorage {
  isEncryptionAvailable(): boolean
  getSelectedStorageBackend(): string
}

/**
 * Linux's basic_text fallback is not a protected persistent key store.
 *
 * CHESS_TUTOR_NO_SAFE_STORAGE=1 short-circuits before `isEncryptionAvailable()`:
 * that call makes Chromium fetch the OSCrypt key from the OS key store, which on
 * an ad-hoc signed macOS build prompts for the keychain password on every new
 * build signature. An unattended smoke test must never block on that dialog, so
 * headless runs opt out and fall back to session-only keys.
 */
export function canPersistSecrets(
  storage: KeyStorage,
  platform = process.platform,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.CHESS_TUTOR_NO_SAFE_STORAGE === '1') return false
  if (!storage.isEncryptionAvailable()) return false
  if (platform !== 'linux') return true
  return ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend())
}
