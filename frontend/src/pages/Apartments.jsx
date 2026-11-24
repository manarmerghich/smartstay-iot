import { useEffect, useState } from 'react'
import Icon from '../components/Icons'
import SafeImage from '../components/SafeImage'
import StatusPill from '../components/StatusPill'
import SimBadge from '../components/SimBadge'
import Toggle from '../components/Toggle'
import AcGraphic from '../components/AcGraphic'
import WindowGraphic from '../components/WindowGraphic'
import KeypadPanel from '../components/KeypadPanel'
import { LineChart } from '../components/Charts'
import { DOOR_IMAGE } from '../data/mockData'
import { fetchMeasurements, USE_MOCK } from '../services/api'
import {
  currentReservation, describeAction, describeDetail, fmtDate, fmtDateTime, fmtHM, nextReservation, nightsBetween,
  round1, weekLabels,
} from '../utils/helpers'
import { useI18n } from '../i18n/useI18n'
import { useNow } from '../hooks/useNow'

export default function Apartments({ apartments, reservations, logs, selectedId, onSelect, command, busy, setCleaning, keypad }) {
  const { t, city, lang } = useI18n()
  const apt = apartments.find((a) => a.id === selectedId) ?? apartments[0]
  const nowMs = useNow(1000)
  const cur = currentReservation(apt.id, reservations, nowMs)
  const next = nextReservation(apt.id, reservations, nowMs)
  const aptLogs = logs.filter((l) => l.apartment_id === apt.id && l.actor_type !== 'keypad' && l.action !== 'verify_code').slice(0, 6)
  const open = apt.door === 'unlocked'

  // temperature history: real = GET /apartments/{id}/measurements, demo = local buffer
  const [history, setHistory] = useState([])
  useEffect(() => {
    if (USE_MOCK) return
    let stop = false
    const load = () => fetchMeasurements(apt.id, 40)
      .then((rows) => { if (!stop) setHistory([...rows].reverse()) })
      .catch(() => {})
    load()
    const id = setInterval(load, 10000)
    return () => { stop = true; clearInterval(id) }
  }, [apt.id])
  const temps = USE_MOCK ? (apt.tempHistory || []).map((v) => ({ v, l: '' })) : history.map((m) => ({ v: m.temperature, l: fmtHM(m.recorded_at, lang) }))

  const values = [...apt.energyHistory, round1(apt.energyToday)]
  const ageS = apt.lastUpdate ? Math.max(0, Math.floor((nowMs - new Date(apt.lastUpdate).getTime()) / 1000)) : null

  let presenceNote = t('pres.ok'); let presenceWarn = false
  if (apt.status === 'occupied' && !apt.presence) { presenceNote = t('pres.noOne'); presenceWarn = true }
  if (apt.status !== 'occupied' && apt.presence) {
    presenceNote = apt.status === 'cleaning' ? t('pres.cleaning') : t('pres.unexpected')
    presenceWarn = apt.status !== 'cleaning'
  }

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
          <StatusPill status={apt.status} />
          <h2>{apt.name}</h2>
          <p><Icon name="pin" size={15} /> {apt.address}, {city(apt.city)}</p>
        </div>
      </section>

      <div className="detail-grid">
        {/* FRONT DOOR */}
        <section className="card device photo-card">
          <div className="device-photo" style={{ backgroundImage: `url(${DOOR_IMAGE})` }}>
            <span className={`state-chip ${open ? 'warn' : 'ok'}`}><Icon name={open ? 'unlock' : 'lock'} size={14} /> {t(open ? 'door.open' : 'door.closed')}</span>
          </div>
          <div className="card-head"><h3><Icon name="door" size={18} /> {t('door.title')}</h3></div>
          <button className={`btn ${open ? 'btn-outline' : 'btn-primary'}`} disabled={busy}
            onClick={() => command(apt.id, 'door', open ? 'locked' : 'unlocked')}>
            <Icon name={open ? 'lock' : 'unlock'} size={16} /> {t(open ? 'door.close' : 'door.openBtn')}
          </button>
          <small className="muted">{t('door.auto')}</small>
        </section>

        {/* AIR CONDITIONER */}
        <section className="card device">
          <div className="card-head">
            <h3><Icon name="wind" size={18} /> {t('ac.title')}</h3>
            <Toggle checked={apt.ac.on} disabled={busy} label={t('ac.power')} onChange={(v) => command(apt.id, 'ac', { on: v })} />
          </div>
          <div className="graphic-box"><AcGraphic on={apt.ac.on} /></div>
          <span className={`state-chip ${apt.ac.on ? 'ok' : ''}`}>{t(apt.ac.on ? 'ac.activated' : 'ac.deactivated')}</span>
          <small className="muted"><i className={`led ${apt.ac.on ? 'on' : ''}`} /> {t('ac.led')}</small>
        </section>

        {/* AUTOMATED WINDOW */}
        <section className="card device">
          <div className="card-head"><h3><Icon name="window" size={18} /> {t('window.title')}</h3></div>
          <div className="graphic-box"><WindowGraphic open={apt.window === 'open'} /></div>
          <span className={`state-chip ${apt.window === 'open' ? 'warn' : 'ok'}`}>{t(apt.window === 'open' ? 'window.open' : 'window.closed')}</span>
          <button className="btn btn-outline" disabled={busy} onClick={() => command(apt.id, 'window', apt.window === 'open' ? 'closed' : 'open')}>
            {t(apt.window === 'open' ? 'window.close' : 'window.openBtn')}
          </button>
          <small className="muted">{t('window.manual')}</small>
          {apt.ac.on && apt.window === 'open' && <small className="warn-text">{t('window.warn')}</small>}
        </section>

        {/* SENSORS */}
        <section className="card">
          <div className="card-head"><h3>{t('sensors.title')}</h3><SimBadge /></div>
          <div className="sensor-list">
            <div><Icon name="thermo" /><span>{t('m.temperature')} <small>DHT22</small></span><b dir="ltr">{apt.temperature} °C</b></div>
            <div><Icon name="drop" /><span>{t('m.humidity')} <small>DHT22</small></span><b dir="ltr">{apt.humidity} %</b></div>
            <div><Icon name="user" /><span>{t('sensors.presence')} <small>PIR</small></span><b>{t(apt.presence ? 'sensors.detected' : 'sensors.nobody')}</b></div>
          </div>
          <div className="refresh-line">
            <i className="pulse" />
            <span>{ageS === null ? t('sensors.waiting') : t('sensors.updated', { n: ageS })}</span>
            <small>{t('sensors.refresh')}</small>
          </div>
        </section>

        {/* ACCESS CONTROL */}
        <section className="card span-2">
          <div className="card-head"><h3><Icon name="key" size={18} /> {t('keypad.title')}</h3></div>
          <KeypadPanel key={apt.id} aptId={apt.id} logs={logs} interactive onSubmit={keypad} />
        </section>

        {/* RESERVATION + ENERGY */}
        <section className="card">
          <div className="card-head"><h3>{t('res.vsPresence')}</h3></div>
          <div className="two-cols">
            <div className="mini-box">
              <small>{t('res.status')}</small>
              <StatusPill status={apt.status} />
              {cur && <p>{cur.reference}<br /><span className="muted">{fmtDate(cur.check_in, lang)} → {fmtDate(cur.check_out, lang)} · {t('res.nights', { n: nightsBetween(cur.check_in, cur.check_out) })}</span></p>}
              {!cur && next && <p className="muted">{t('res.next')}: {next.reference}<br />{fmtDate(next.check_in, lang)} → {fmtDate(next.check_out, lang)}</p>}
            </div>
            <div className="mini-box">
              <small>{t('sensors.presence')}</small>
              <span className={`pill ${apt.presence ? 'pill-occupied' : 'pill-available'}`}>{t(apt.presence ? 'sensors.detected' : 'sensors.nobody')}</span>
              <p className={presenceWarn ? 'warn-text' : 'muted'}>{presenceNote}</p>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => setCleaning(apt.id, apt.status !== 'cleaning')}>
            <Icon name="broom" size={16} /> {t(apt.status === 'cleaning' ? 'clean.done' : 'clean.start')}
          </button>
        </section>

        <section className="card span-2">
          <div className="card-head"><h3>{t('en.apt7')}</h3><SimBadge /></div>
          <div className="energy-today"><b>{apt.energyToday.toFixed(2)}</b><span>{t('m.kwhToday')}</span></div>
          <LineChart labels={weekLabels(lang)} series={[{ label: apt.name, values, color: '#d8aa62', area: true }]} />
        </section>

        {temps.length > 1 && (
          <section className="card span-all">
            <div className="card-head"><h3>{t('hist.title')}</h3><SimBadge /></div>
            <LineChart unit="°C" zoom labels={temps.map((x) => x.l)} series={[{ label: t('m.temperature'), values: temps.map((x) => x.v), color: '#9cc7a9', area: true }]} />
          </section>
        )}

        <section className="card span-all">
          <div className="card-head"><h3>{t('log.aptTitle')}</h3></div>
          {aptLogs.length === 0 ? <p className="muted">{t('log.none')}</p> : (
            <ul className="log-list">
              {aptLogs.map((l) => (
                <li key={l.id}>
                  <span className={`badge ${l.result === 'accepted' ? 'b-ok' : 'b-err'}`}>{t(l.result === 'accepted' ? 'res.ok' : 'res.refused')}</span>
                  <b>{describeAction(l.action, t)}{describeDetail(l.detail, t) && l.result !== 'accepted' ? ` — ${describeDetail(l.detail, t)}` : ''}</b>
                  <small>{l.actor_type === 'automation' ? t('who.automation') : t('role.owner')} · {fmtDateTime(l.ts, lang)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
