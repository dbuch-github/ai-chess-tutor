export interface PlatformInfo {
  id: string
  builderFlag: string
  suffix: string
  platform: string
  arch: string
}
export function platformInfo(platform?: string, arch?: string): PlatformInfo
