/**
 * Einheitliches Icon-Set für die Topbar. Bewusst eine einzige Stilrichtung
 * statt des vorherigen Mix aus bunten Emoji, dünnen Outline-Icons und der
 * farbigen Figuren-Sprite: schlichte Strichzeichnung (eine Kontur, ein
 * gefüllter Akzent je Icon), einfarbig in der Textfarbe (currentColor) –
 * an der Optik der Brett-Figuren orientiert (siehe KingIcon: dieselbe
 * chessground-Sprite wie Brett/Zugliste). Kein Icon hier hat also eine
 * eigene Farbe – nur die echte Figur darf (wie auf dem Brett) schwarz/weiß
 * sein, alles andere zieht seine Farbe aus dem Text drumherum.
 */

interface IconProps {
  /** Kantenlänge in px oder CSS-Einheit (Default: 1.1em, passt sich der Schriftgröße des Buttons an). */
  size?: number | string
}

const STROKE = 1.5

const svgProps = (size: IconProps['size']): React.SVGProps<SVGSVGElement> => ({
  width: size ?? '1.1em',
  height: size ?? '1.1em',
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: STROKE,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true
})

/** Kleines Schachbrett (4x4-Karo) – Symbol für "Neue Partie". */
export function BoardIcon({ size }: IconProps): React.JSX.Element {
  const cell = 4
  const cells: React.JSX.Element[] = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if ((row + col) % 2 === 0) {
        cells.push(<rect key={`${row}-${col}`} x={2 + col * cell} y={2 + row * cell} width={cell} height={cell} fill="currentColor" stroke="none" />)
      }
    }
  }
  return (
    <svg {...svgProps(size)}>
      <rect x="2" y="2" width="16" height="16" rx="1.6" />
      {cells}
    </svg>
  )
}

/** Zahnrad – Ring aus Strichen ergibt zuverlässig Zähne ohne handgezeichneten Pfad. */
export function GearIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <circle cx="10" cy="10" r="6.3" strokeWidth="3" strokeDasharray="2 1.55" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  )
}

/** Kreis mit "i" – für den Info-/Über-Button. Punkt als gefüllter Akzent, wie beim übrigen Icon-Set. */
export function InfoIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <circle cx="10" cy="10" r="7.3" />
      <circle cx="10" cy="6.4" r="0.95" fill="currentColor" stroke="none" />
      <line x1="10" y1="9.3" x2="10" y2="14.3" />
    </svg>
  )
}

/** Diskette, Basis für Export-/Import-Symbol. */
function Disk(): React.JSX.Element {
  return (
    <>
      <rect x="3.2" y="6.6" width="13.6" height="10.8" rx="1.6" />
      <rect x="6.6" y="6.6" width="6.8" height="3.2" />
      <rect x="8.3" y="12.3" width="3.4" height="3.1" />
    </>
  )
}

/** Diskette mit Pfeil, der von ihr weg zeigt – "Partie als Datei speichern". */
export function ExportIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <Disk />
      <path d="M10 1 V5.4" />
      <path d="M7.3 3.5 L10 0.8 L12.7 3.5" />
    </svg>
  )
}

/** Diskette mit Pfeil, der zu ihr hin zeigt – "Partie aus Datei laden". */
export function ImportIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <Disk />
      <path d="M10 0.8 V5.2" />
      <path d="M7.3 3 L10 5.7 L12.7 3" />
    </svg>
  )
}

/** Ordner – Symbol für das "Datei"-Menü. */
export function FolderIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <rect x="3" y="6.6" width="14" height="10.4" rx="1.4" />
      <rect x="3" y="4.6" width="7" height="3" rx="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Aufnahme-Ring – Symbol für "OTB-Partie aufzeichnen". */
export function CameraIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Balkendiagramm – Symbol für die Analyse-Anzeige. */
export function ChartIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 17 H17" />
      <rect x="4.4" y="11.4" width="3.2" height="5.6" />
      <rect x="9.4" y="7.4" width="3.2" height="9.6" />
      <rect x="14.4" y="3.6" width="3.2" height="13.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Klemmbrett mit Textzeilen – Symbol für den Partie-Report. */
export function ReportIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <rect x="4" y="3.4" width="12" height="14.4" rx="1.4" />
      <rect x="7.4" y="2" width="5.2" height="2.6" rx="0.8" fill="currentColor" stroke="none" />
      <path d="M6.6 8.6 H13.4" />
      <path d="M6.6 11.6 H13.4" />
      <path d="M6.6 14.6 H10.2" />
    </svg>
  )
}

/** Buchrücken – Symbol für die Bibliothek. */
export function BooksIcon({ size }: IconProps): React.JSX.Element {
  return (
    <svg {...svgProps(size)}>
      <rect x="3.6" y="5" width="3.6" height="12" rx="0.8" />
      <rect x="8.2" y="3" width="3.6" height="14" rx="0.8" fill="currentColor" stroke="none" />
      <rect x="12.8" y="6.4" width="3.6" height="10.6" rx="0.8" />
    </svg>
  )
}

/**
 * Königsfigur in echter Chessground-Optik (dieselben Sprites wie Brett/
 * Zugliste, siehe Figurine.tsx) statt Unicode-Glyphen oder Nachbau – der
 * Stil-Anker, an dem sich alle Icons oben orientieren. Nur so lässt sich
 * die schwarze Figur mit dem üblichen hellen Schein vom dunklen Hintergrund
 * abheben (siehe piece.figurine.black in styles.css).
 */
export function KingIcon({ color }: { color: 'w' | 'b' }): React.JSX.Element {
  return <piece className={`figurine king ${color === 'w' ? 'white' : 'black'}`} />
}
