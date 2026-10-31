import Icon from './Icons'
import SafeImage from './SafeImage'
import StatusPill from './StatusPill'

export default function ApartmentCard({ apt, status, onOpen }) {
  return (
    <article className="apt-card" onClick={() => onOpen(apt.id)} tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(apt.id)} aria-label={`Open ${apt.name}`}>
      <div className="apt-photo">
        <SafeImage src={apt.image} alt={apt.name} />
        <StatusPill status={status.key}>{status.label}</StatusPill>
      </div>
      <div className="apt-body">
        <div className="apt-title">
          <h3>{apt.name}</h3>
          <span className="city"><Icon name="pin" size={14} /> {apt.city}</span>
        </div>
        <div className="chips">
          <span className={`chip ${apt.door === 'unlocked' ? 'warn' : 'ok'}`}>
            <Icon name={apt.door === 'locked' ? 'lock' : 'unlock'} size={14} /> {apt.door === 'locked' ? 'Locked' : 'Unlocked'}
          </span>
          <span className={`chip ${apt.ac.on ? 'ok' : ''}`}>
            <Icon name="wind" size={14} /> A/C {apt.ac.on ? `${apt.ac.target}°` : 'off'}
          </span>
          <span className="chip">
            <Icon name="window" size={14} /> {apt.window === 'open' ? 'Open' : 'Closed'}
          </span>
        </div>
        <div className="apt-metrics">
          <div><Icon name="thermo" size={16} /><b>{apt.temperature}°C</b><small>Temperature</small></div>
          <div><Icon name="drop" size={16} /><b>{apt.humidity}%</b><small>Humidity</small></div>
          <div><Icon name="bolt" size={16} /><b>{apt.energyToday.toFixed(1)}</b><small>kWh today</small></div>
        </div>
      </div>
    </article>
  )
}
