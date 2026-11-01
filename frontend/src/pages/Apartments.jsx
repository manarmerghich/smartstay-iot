import { PERMISSIONS } from '../data/mockData'
import Icon from '../components/Icons'
import SafeImage from '../components/SafeImage'
import StatusPill from '../components/StatusPill'
import SimBadge from '../components/SimBadge'
import Toggle from '../components/Toggle'
import ThermostatDial from '../components/ThermostatDial'
import { LineChart } from '../components/Charts'
import { apartmentStatus, fmtDate, fmtDateTime, fmtTime, nextReservation, nightsBetween, todayISO, weekLabels, round1 } from '../utils/helpers'

const MODES = [
  { id: 'cool', label: 'Cool', icon: 'wind' },
  { id: 'auto', label: 'Auto', icon: 'automation' },
  { id: 'dry', label: 'Dry', icon: 'drop' },
]

export default function Apartments({ apartments, reservations, selectedId, onSelect, user, command, busy, logs, setCleaning }) {
  const apt = apartments.find((a) => a.id === selectedId) ?? apartments[0]
  const today = todayISO()
  const status = apartmentStatus(apt, reservations, today)
  const allowed = PERMISSIONS[user.role] ?? []
  const can = (d) => allowed.includes(d)
  const next = nextReservation(apt.id, reservations, today)
  const aptLogs = logs.filter((l) => l.apartmentId === apt.id).slice(0, 6)

  const labels = weekLabels()
  const values = [...apt.energyHistory, round1(apt.energyToday)]

  // presence vs reservation — two DIFFERENT pieces of information
  let presenceNote = 'Reservation and sensor are consistent.'
  let presenceTone = 'ok'
  if (status.key === 'occupied' && !apt.presence) { presenceNote = 'Reserved, but no one is detected inside.'; presenceTone = 'warn' }
  if (status.key !== 'occupied' && apt.presence) { presenceNote = status.key === 'cleaning' ? 'Presence detected — probably the cleaning staff.' : 'Presence detected without an active reservation!'; presenceTone = status.key === 'cleaning' ? 'ok' : 'warn' }

  return (
    <div className="page">
      <div className="tabs" role="tablist">
        {apartments.map((a) => (
          <button key={a.id} role="tab" aria-selected={a.id === apt.id} className={`tab ${a.id === apt.id ? 'active' : ''}`} onClick={() => onSelect(a.id)}>
            {a.name}
          </button>
        ))}
      </div>

      <section className="detail-hero">
        <SafeImage src={apt.image} alt={apt.name} className="hero-img" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <StatusPill status={status.key}>{status.label}</StatusPill>
          <h2>{apt.name}</h2>
          <p><Icon name="pin" size={15} /> {apt.address}, {apt.city}</p>
        </div>
      </section>

      {!allowed.length || allowed.length < 3 ? (
        <div className="notice"><Icon name="shield" size={16} /> Signed in as <b>{user.label}</b>: limited access ({allowed.join(', ') || 'read-only'} commands only). Other commands will be rejected by the server.</div>
      ) : null}

      <div className="detail-grid">
        {/* DOOR */}
        <section className="card device">
          <div className="card-head"><h3><Icon name="door" size={18} /> Front door</h3></div>
          <div className={`big-state ${apt.door === 'locked' ? 'ok' : 'warn'}`}>
            <Icon name={apt.door === 'locked' ? 'lock' : 'unlock'} size={44} strokeWidth={1.4} />
            <b>{apt.door === 'locked' ? 'Locked' : 'Unlocked'}</b>
          </div>
          <button className={`btn ${apt.door === 'locked' ? 'btn-primary' : 'btn-outline'}`} disabled={busy}
            onClick={() => command(apt.id, 'door', apt.door === 'locked' ? 'unlocked' : 'locked')}>
            <Icon name={apt.door === 'locked' ? 'unlock' : 'lock'} size={16} /> {apt.door === 'locked' ? 'Unlock door' : 'Lock door'}
          </button>
          {!can('door') && <small className="muted">Your role cannot control the door.</small>}
        </section>

        {/* AC */}
        <section className="card device ac-card">
          <div className="card-head">
            <h3><Icon name="wind" size={18} /> Air conditioner</h3>
            <Toggle checked={apt.ac.on} disabled={busy} label="Air conditioner power" onChange={(v) => command(apt.id, 'ac', { on: v })} />
          </div>
          <ThermostatDial target={apt.ac.target} current={apt.temperature} on={apt.ac.on} disabled={busy}
            onChange={(t) => command(apt.id, 'ac', { target: t })} />
          <div className="modes">
            {MODES.map((m) => (
              <button key={m.id} disabled={busy || !apt.ac.on} className={`mode ${apt.ac.mode === m.id ? 'active' : ''}`}
                onClick={() => command(apt.id, 'ac', { mode: m.id })} aria-label={`Mode ${m.label}`}>
                <Icon name={m.icon} size={16} /> {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* WINDOW */}
        <section className="card device">
          <div className="card-head"><h3><Icon name="window" size={18} /> Automated window</h3></div>
          <div className={`big-state ${apt.window === 'closed' ? 'ok' : 'info'}`}>
            <Icon name="window" size={44} strokeWidth={1.4} />
            <b>{apt.window === 'open' ? 'Open' : 'Closed'}</b>
          </div>
          <button className="btn btn-outline" disabled={busy} onClick={() => command(apt.id, 'window', apt.window === 'open' ? 'closed' : 'open')}>
            {apt.window === 'open' ? 'Close window' : 'Open window'}
          </button>
          {apt.ac.on && apt.window === 'open' && <small className="warn-text">A/C is running with the window open — the “Save energy” rule will close it.</small>}
        </section>

        {/* SENSORS */}
        <section className="card">
          <div className="card-head"><h3>Live sensors</h3><SimBadge /></div>
          <div className="sensor-list">
            <div><Icon name="thermo" /><span>Temperature</span><b>{apt.temperature} °C</b></div>
            <div><Icon name="drop" /><span>Humidity</span><b>{apt.humidity} %</b></div>
            <div><Icon name="user" /><span>Presence sensor</span><b>{apt.presence ? 'Detected' : 'Nobody'}</b></div>
          </div>
          <small className="muted">Last measurement: {apt.lastUpdate ? fmtTime(apt.lastUpdate) : 'waiting for the first reading…'}</small>
        </section>

        {/* RESERVATION */}
        <section className="card">
          <div className="card-head"><h3>Reservation vs presence</h3></div>
          <div className="two-cols">
            <div className="mini-box">
              <small>Reservation status</small>
              <StatusPill status={status.key}>{status.label}</StatusPill>
              {status.reservation && <p>{status.reservation.guest}<br /><span className="muted">{fmtDate(status.reservation.start)} → {fmtDate(status.reservation.end)} · {nightsBetween(status.reservation.start, status.reservation.end)} nights</span></p>}
              {!status.reservation && next && <p className="muted">Next: {next.guest}<br />{fmtDate(next.start)} → {fmtDate(next.end)}</p>}
            </div>
            <div className="mini-box">
              <small>Sensor presence</small>
              <span className={`pill ${apt.presence ? 'pill-occupied' : 'pill-available'}`}>{apt.presence ? 'Presence detected' : 'No presence'}</span>
              <p className={presenceTone === 'warn' ? 'warn-text' : 'muted'}>{presenceNote}</p>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setCleaning(apt.id, !apt.cleaning)}>
            <Icon name="broom" size={16} /> {apt.cleaning ? 'Mark cleaning as done' : 'Mark as “in cleaning”'}
          </button>
        </section>

        {/* ENERGY */}
        <section className="card">
          <div className="card-head"><h3>Energy — 7 days</h3><SimBadge /></div>
          <div className="energy-today"><b>{apt.energyToday.toFixed(2)}</b><span>kWh today</span></div>
          <LineChart labels={labels} series={[{ label: apt.name, values, color: '#d49a82', area: true }]} />
        </section>

        {/* LOGS */}
        <section className="card span-all">
          <div className="card-head"><h3>Latest commands for this apartment</h3></div>
          {aptLogs.length === 0 ? <p className="muted">No commands yet.</p> : (
            <ul className="log-list">
              {aptLogs.map((l) => (
                <li key={l.id}>
                  <span className={`badge ${l.result === 'success' ? 'b-ok' : 'b-err'}`}>{l.result === 'success' ? 'Success' : 'Rejected'}</span>
                  <b>{l.command}</b>
                  <small>{l.user} · {fmtDateTime(l.time)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
