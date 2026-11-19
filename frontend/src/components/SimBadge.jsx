import Icon from './Icons'
import { useI18n } from '../i18n/useI18n'

export default function SimBadge({ text }) {
  const { t } = useI18n()
  return (
    <span className="sim-badge" title={t('sim.title')}>
      <Icon name="info" size={13} /> {text ?? t('sim.badge')}
    </span>
  )
}
