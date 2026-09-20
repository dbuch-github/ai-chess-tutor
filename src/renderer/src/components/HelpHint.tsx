import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { QuestionIcon } from './icons'

type HelpSection = 'tutor' | 'analysis' | 'moveList' | 'chessnut'

interface HelpHintProps {
  section: HelpSection
  /** 'above': Popover öffnet nach oben statt nach unten – für Anker nahe am unteren
   *  Fensterrand (z. B. Chessnut-Leiste unter dem Brett), sonst ragt es aus dem Fenster. */
  placement?: 'below' | 'above'
}

const POPOVER_WIDTH = 260
const GAP = 6

/**
 * Kleines "?"-Icon neben einem Panel-Titel: öffnet ein Popover mit der Kurzerklärung
 * dieses Bereichs (dieselben help.<section>Title/Text-Keys wie in der großen Hilfe-
 * Seite, siehe HelpDialog.tsx), ohne dass man dafür erst Info/Hilfe öffnen muss.
 * Das Popover wird per Portal direkt in document.body gerendert (fixed positioniert
 * anhand der Button-Bounding-Box) statt absolut im umgebenden Panel – sonst würde es
 * von Panels mit `overflow: hidden` (z. B. der Chessnut-Leiste) abgeschnitten.
 */
export function HelpHint({ section, placement = 'below' }: HelpHintProps): React.JSX.Element {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const toggle = (): void => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const left = Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8)
      setPos(
        placement === 'above'
          ? { left, bottom: window.innerHeight - r.top + GAP }
          : { left, top: r.bottom + GAP }
      )
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <span className="help-hint">
      <button
        type="button"
        ref={btnRef}
        className="help-hint-btn"
        aria-label={t(`help.${section}Title`)}
        onClick={toggle}
      >
        <QuestionIcon size={12} bare />
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={popoverRef} className="help-hint-popover" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}>
            <h4>{t(`help.${section}Title`)}</h4>
            <p>{t(`help.${section}Text`)}</p>
          </div>,
          document.body
        )}
    </span>
  )
}
