import { useTranslation } from 'react-i18next'

/**
 * Legende für die Zugwirkungs-Overlays (Pfeile/Ringe), siehe Board.tsx
 * (suggestionToShapes, live) und PositionThumbnail.tsx (statisch im Partie-Report) –
 * dieselbe Farbsprache an beiden Stellen.
 */
export function VisualLegend({ showFollowUp = true }: { showFollowUp?: boolean }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="preview-legend">
      <span>
        <i className="swatch swatch-blue" /> {t('legend.move')}
        {showFollowUp && t('legend.moveFollowUp')}
      </span>
      <span>
        <i className="swatch swatch-red" /> {t('legend.attacks')}
      </span>
      <span>
        <i className="swatch swatch-green" /> {t('legend.defends')}
      </span>
      <span>
        <i className="swatch swatch-purple" /> {t('legend.pins')}
      </span>
      <span>
        <i className="swatch swatch-darkgreen" /> {t('legend.discovers')}
      </span>
      <span>
        <i className="swatch swatch-grey" /> {t('legend.becomesWeak')}
      </span>
      <span>
        <i className="swatch swatch-pink" /> {t('legend.check')}
      </span>
    </div>
  )
}
