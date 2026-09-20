/**
 * Elo-Schätzung der eigenen Spielstärke nach dem Standard-Rating-Update
 * (bekannte Gegnerstärke + Partieergebnis), nicht über eine erfundene
 * Centipawn-Kalibrierung – die App kennt die Gegner-Elo exakt, weil sie sie
 * selbst gesetzt hat (UCI_Elo bzw. Maia-Level).
 */

const PROVISIONAL_GAMES = 10
const PROVISIONAL_K = 40
const STANDARD_K = 20

export function kFactor(ratedGames: number): number {
  return ratedGames < PROVISIONAL_GAMES ? PROVISIONAL_K : STANDARD_K
}

export function expectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400))
}

/** `actualScore`: 1 = Sieg, 0.5 = Remis, 0 = Niederlage (aus Spielersicht). */
export function updateElo(
  playerElo: number,
  ratedGames: number,
  opponentElo: number,
  actualScore: 0 | 0.5 | 1
): number {
  const expected = expectedScore(playerElo, opponentElo)
  return Math.round(playerElo + kFactor(ratedGames) * (actualScore - expected))
}

/** Nächstgelegener Wert aus einer Liste verfügbarer Stufen (z. B. Maia-Level). */
export function nearestLevel(elo: number, levels: readonly number[]): number {
  return levels.reduce((best, level) => (Math.abs(level - elo) < Math.abs(best - elo) ? level : best))
}

export function clampElo(elo: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, elo))
}
