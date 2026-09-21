interface KeyStorage {
  isEncryptionAvailable(): boolean
  getSelectedStorageBackend(): string
}

/** Linux's basic_text fallback is not a protected persistent key store. */
export function canPersistSecrets(storage: KeyStorage, platform = process.platform): boolean {
  if (!storage.isEncryptionAvailable()) return false
  if (platform !== 'linux') return true
  return ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend())
}
