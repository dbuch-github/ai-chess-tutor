import { useEffect, useRef, useState } from 'react'

interface TopbarDropdownProps {
  label: React.ReactNode
  children: React.ReactNode
  disabled?: boolean
  /** 'right': Menü an der rechten statt linken Kante des Buttons ausrichten –
   *  für Dropdowns nahe am rechten Fensterrand (z. B. Sprachauswahl), damit
   *  das Menü nicht über den Fensterrand hinausragt. Default 'left'. */
  align?: 'left' | 'right'
}

/**
 * Kleines Dropdown-Menü für die Topbar (z. B. "Neue Partie ▾", "Datei ▾"):
 * öffnet per Klick, schließt bei Klick außerhalb, Escape oder Klick auf
 * einen Menüpunkt (Event-Delegation – Menüpunkte brauchen keinen eigenen
 * Close-Handler).
 */
export function TopbarDropdown({ label, children, disabled, align = 'left' }: TopbarDropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
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
    <div className="dropdown" ref={ref}>
      <button className="btn" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label} <span className="chev">▾</span>
      </button>
      {open && (
        // cg-wrap: falls ein Menüpunkt eine echte Figuren-Sprite nutzt (siehe icons.tsx/KingIcon),
        // zieht sich die von chessground geladenen Sprites, siehe Figurine.tsx für dieselbe Technik.
        <div className={`menu cg-wrap ${align === 'right' ? 'menu-align-right' : ''}`} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
