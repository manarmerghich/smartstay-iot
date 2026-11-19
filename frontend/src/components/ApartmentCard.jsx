import Icon from './Icons'
import SafeImage from './SafeImage'
import StatusPill from './StatusPill'
import { useI18n } from '../i18n/useI18n'

export default function ApartmentCard({ apt, onOpen }) {
  const { t, city } = useI18n()
  const open = apt.door === 'unlocked'
  return (
    <article className="apt-card" onClick={() => onOpen(apt.id)} tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(apt.id)} aria-label={`${t('card.open')} ${apt.name}`}>
      <div className="apt-photo">
        <SafeImage src={apt.image} alt={apt.name} />
      </div>
      <div className="apt-body">
        <div className="apt-title">
          <div>
            <h3>{apt.name}</h3>
            <span className="city"><Icon name="pin" size={14} /> {city(apt.city)}</span>
          </div>
          <StatusPill status={apt.status} />
        </div>
        <div className="chips">
          <span className={`chip ${open ? 'warn' : 'ok'}`}>
            <Icon name={open ? 'unlock' : 'lock'} size={14} /> {t(open ? 'door.open' : 'door.closed')}
          </span>
          <span className={`chip ${apt.ac.on ? 'ok' : ''}`}>
            <Icon name="wind" size={14} /> {t('ac.short')} {t(apt.ac.on ? 'on' : 'off')}
          </span>
          <span className="chip">
            <Icon name="window" size={14} /> {t(apt.window === 'open' ? 'window.open' : 'window.closed')}
          </span>
        </div>
        <div className="apt-metrics">
          <div><Icon name="thermo" size={16} /><b dir="ltr">{apt.temperature}°C</b><small>{t('m.temperature')}</small></div>
          <div><Icon name="drop" size={16} /><b dir="ltr">{apt.humidity}%</b><small>{t('m.humidity')}</small></div>
          <div><Icon name="bolt" size={16} /><b>{apt.energyToday.toFixed(1)}</b><small>{t('m.kwhToday')}</small></div>
        </div>
      </div>
    </article>
  )
}
