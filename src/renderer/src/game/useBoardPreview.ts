import { useCallback, useEffect, useState } from 'react'
import type { MovePreview } from './boardVisuals'

/** Was aktuell auf dem Brett eingeblendet ist, plus wer es angefordert hat. */
export type ActivePreview = Omit<MovePreview, 'fen'> & { sourceKey: string }

export interface BoardPreviewApi {
  active: ActivePreview | null
  isActive: (sourceKey: string) => boolean
  show: (sourceKey: string, preview: MovePreview) => void
  toggle: (sourceKey: string, preview: MovePreview) => void
  hide: () => void
}

/**
 * Ein einziger "was zeigen wir gerade auf dem Brett"-Zustand, gemeinsam
 * genutzt vom Tutor-Chat (Zugvorschlag/Fehlerkommentar) und den anklickbaren
 * Analyse-Linien. `sourceKey` identifiziert die Quelle (z. B. `msg-3` oder
 * `line-2`), damit jede Quelle unabhängig prüfen kann, ob gerade ihr eigener
 * Vorschlag aktiv ist.
 */
export function useBoardPreview(currentFen: string): BoardPreviewApi {
  const [active, setActive] = useState<ActivePreview | null>(null)

  // Stellung hat sich weiterbewegt – ein alter Vorschlag würde nicht mehr passen
  useEffect(() => {
    setActive(null)
  }, [currentFen])

  const show = useCallback((sourceKey: string, preview: MovePreview) => {
    const { fen: _fen, ...rest } = preview
    setActive({ sourceKey, ...rest })
  }, [])

  const toggle = useCallback((sourceKey: string, preview: MovePreview) => {
    setActive((prev) => {
      if (prev?.sourceKey === sourceKey) return null
      const { fen: _fen, ...rest } = preview
      return { sourceKey, ...rest }
    })
  }, [])

  const hide = useCallback(() => setActive(null), [])
  const isActive = useCallback((sourceKey: string) => active?.sourceKey === sourceKey, [active])

  return { active, isActive, show, toggle, hide }
}
