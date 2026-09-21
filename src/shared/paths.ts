/** Renderer-safe dirname for both native path syntaxes, including drive roots. */
export function dirnameOf(path: string): string | undefined {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (index < 0) return undefined
  if (index === 0 || (index === 2 && path[1] === ':')) return path.slice(0, index + 1)
  return path.slice(0, index)
}
