import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const appId = 'de.dbuch.aichesstutor'

/** codesign schreibt seine Diagnose auf stderr, auch im Erfolgsfall – deshalb
 *  beide Ströme einsammeln statt nur stdout. */
function codesign(args) {
  const result = spawnSync('codesign', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  const output = (result.stdout || '') + (result.stderr || '')
  if (result.status !== 0) throw new Error(`codesign ${args.join(' ')} failed (${result.status}):\n${output}`)
  return output
}

/** Prüft die macOS-Signatur des gepackten Bundles. Ohne diese Prüfung bliebe ein
 *  Rückfall auf „unsigniert" unbemerkt: Die App startet auch dann, Gatekeeper
 *  meldet sie auf dem Rechner eines Fremden aber als „beschädigt" – ein Dialog
 *  ohne Ausweg. Geprüft wird deshalb nicht bloß, dass eine Signatur vorhanden
 *  ist, sondern dass sie strukturell gültig ist: gesiegelte Resources statt nur
 *  der Linker-Ad-hoc-Signatur des Binaries, und die eigene Bundle-ID statt
 *  „Electron". Notarisierung ist bewusst nicht Teil der Prüfung – die hängt an
 *  einer Kostenentscheidung und ist hier nicht vorausgesetzt. */
export function verifySignature(appPath) {
  const details = codesign(['-dvv', appPath])
  const identifier = /^Identifier=(.*)$/m.exec(details)?.[1]
  if (identifier !== appId) throw new Error(`Unexpected signing identifier: ${identifier ?? 'none'} (expected ${appId})\n${details}`)
  if (!/Sealed Resources version=\d+/.test(details)) {
    throw new Error(`Bundle has no sealed resources – only the linker ad-hoc signature is present:\n${details}`)
  }
  const verified = codesign(['--verify', '--strict', '--deep', '--verbose=2', appPath])
  for (const expected of ['valid on disk', 'satisfies its Designated Requirement']) {
    if (!verified.includes(expected)) throw new Error(`codesign --verify did not report "${expected}":\n${verified}`)
  }
  console.log(`macOS signature valid: ${identifier}, sealed resources present, designated requirement satisfied.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    verifySignature(process.argv[2] ?? 'dist/mac-arm64/AI Chess Tutor.app')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
