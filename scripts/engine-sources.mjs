// Pinned upstream releases. Hashes are the SHA-256 release-asset digests.
const stockfishBase = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_19/'
export const STOCKFISH = {
  'mac-arm64': { archive: 'stockfish-macos-universal.tar.gz', sha256: 'a1f0e3bcc5a6927a11fe6fc8e54a779754645f3c2bae2cf13420fd1957adaa77' },
  'win-x64': { archive: 'stockfish-windows-x86-64-universal.zip', sha256: '3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7' },
  'linux-x64': { archive: 'stockfish-linux-x86-64-universal.tar.gz', sha256: '9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f' }
}
for (const source of Object.values(STOCKFISH)) source.url = stockfishBase + source.archive
export const LC0_VERSION = '0.32.1'
export const LC0_WINDOWS = {
  url: `https://github.com/LeelaChessZero/lc0/releases/download/v${LC0_VERSION}/lc0-v${LC0_VERSION}-windows-cpu-openblas.zip`,
  sha256: 'b2caa8443f0e0cb15cf76c335c53985f2973cd6438e77d3e2366cd21d2effa38'
}
export const MAIA_LEVELS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
export const MAIA_BASE_URL = 'https://github.com/CSSLab/maia-chess/releases/download/v1.0'
