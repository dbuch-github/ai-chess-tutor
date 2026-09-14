/**
 * Legende für die Zugwirkungs-Overlays (Pfeile/Ringe), siehe Board.tsx
 * (suggestionToShapes, live) und PositionThumbnail.tsx (statisch im Partie-Report) –
 * dieselbe Farbsprache an beiden Stellen.
 */
export function VisualLegend({ showFollowUp = true }: { showFollowUp?: boolean }): React.JSX.Element {
  return (
    <div className="preview-legend">
      <span>
        <i className="swatch swatch-blue" /> Zug{showFollowUp && ' (& Folgezüge blasser)'}
      </span>
      <span>
        <i className="swatch swatch-red" /> greift an
      </span>
      <span>
        <i className="swatch swatch-green" /> deckt
      </span>
      <span>
        <i className="swatch swatch-purple" /> fesselt
      </span>
      <span>
        <i className="swatch swatch-darkgreen" /> deckt auf
      </span>
      <span>
        <i className="swatch swatch-grey" /> wird schwach
      </span>
      <span>
        <i className="swatch swatch-pink" /> Schach
      </span>
    </div>
  )
}
