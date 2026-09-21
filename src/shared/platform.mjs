/** One platform map shared by setup, packaging and the Electron main process. */
export function platformInfo(platform = process.platform, arch = process.arch) {
  const targets = {
    'darwin-arm64': { id: 'mac-arm64', builderFlag: '--mac', suffix: '' },
    'win32-x64': { id: 'win-x64', builderFlag: '--win', suffix: '.exe' },
    'linux-x64': { id: 'linux-x64', builderFlag: '--linux', suffix: '' }
  }
  const target = targets[`${platform}-${arch}`]
  if (!target) throw new Error(`Unsupported platform: ${platform}/${arch}. Supported: macOS arm64, Windows x64, Linux x64.`)
  return { ...target, platform, arch }
}
