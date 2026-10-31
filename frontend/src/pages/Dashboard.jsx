import { useState } from 'react'
import ApartmentCard from '../components/ApartmentCard'
import { LineChart, BarList } from '../components/Charts'
import Icon from '../components/Icons'
import SimBadge from '../components/SimBadge'
import SafeImage from '../components/SafeImage'
import { HERO_IMAGE, OUTSIDE_TEMP } from '../data/mockData'
import { COLORS, apartmentStatus, round1, sum, todayISO, weekLabels } from '../utils/helpers'

export default function Dashboard({ apartments, reservations, onOpen }) {
  const [city, setCity] = useState('All')
  const today = todayISO()
  const cities = ['All', ...new Set(apartments.map((a) => a.city))]
  const withStatus = apartments.map((a) => ({ apt: a, status: apartmentStatus(a, reservations, today) }))
  const shown = withStatus.filter((x) => city === 'All' || x.apt.city === city)

  const occupied = withStatus.filter((x) => x.status.key === 'occupied').length
  const cleaning = withStatus.filter((x) => x.status.key === 'cleaning').length
  const unlocked = apartments.filter((a) => a.door === 'unlocked')
  const totalToday = round1(sum(apartments.map((a) => a.energyToday)))
  const avgOutside = Math.round(sum(apartments.map((a) => OUTSIDE_TEMP[a.city] ?? 25)) / apartments.length)

  const totals = [...Array(6).keys()].map((i) => round1(sum(apartments.map((a) => a.energyHistory[i]))))
  totals.push(totalToday)

  const alerts = []
  apartments.filter((a) => a.ac.on && a.window === 'open').forEach((a) => alerts.push(`${a.name}: A/C running with the window open`))

  return (
    <div className="page">
      <section className="hero">
        <SafeImage src={HERO_IMAGE} alt="Modern living room" className="hero-img" />
        <div className="hero-overlay" />
        <div className="hero-content">
          <small>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
          <h2>Welcome back!</h2>
          <p>
            You manage {apartments.length} apartments in {cities.length - 1} cities.{' '}
            {alerts.length === 0 ? 'Everything looks good right now.' : `${alerts.length} item${alerts.length > 1 ? 's' : ''} need${alerts.length > 1 ? '' : 's'} your attention.`}
          </p>
          <div className="hero-stats">
            <div><Icon name="thermo" size={18} /><b>{avgOutside}°C</b><small>Avg. outdoor</small></div>
            <div><Icon name="bolt" size={18} /><b>{totalToday}</b><small>kWh today</small></div>
          </div>
        </div>
      </section>

      <section className="kpis">
        <div className="kpi"><span className="kpi-icon"><Icon name="building" /></span><div><b>{apartments.length}</b><small>Apartments</small></div></div>
        <div className="kpi"><span className="kpi-icon"><Icon name="calendar" /></span><div><b>{occupied}</b><small>Reserved / occupied</small></div></div>
        <div className="kpi"><span className="kpi-icon"><Icon name="broom" /></span><div><b>{cleaning}</b><small>In cleaning</small></div></div>
        <div className={`kpi ${unlocked.length ? 'kpi-warn' : ''}`}><span className="kpi-icon"><Icon name={unlocked.length ? 'unlock' : 'lock'} /></span><div><b>{unlocked.length}</b><small>Doors unlocked</small></div></div>
      </section>

      {alerts.length > 0 && (
        <section className="alerts" aria-label="Attention needed">
          <Icon name="alert" size={18} />
          <ul>{alerts.map((a) => <li key={a}>{a}</li>)}</ul>
        </section>
      )}

      <div className="tabs" role="tablist">
        {cities.map((c) => (
          <button key={c} role="tab" aria-selected={city === c} className={`tab ${city === c ? 'active' : ''}`} onClick={() => setCity(c)}>
            {c}
          </button>
        ))}
      </div>

      <section className="apt-grid">
        {shown.map(({ apt, status }) => (
          <ApartmentCard key={apt.id} apt={apt} status={status} onOpen={onOpen} />
        ))}
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Total consumption — last 7 days</h3>
            <SimBadge />
          </div>
          <LineChart labels={weekLabels()} series={[{ label: 'All apartments', values: totals, color: '#8fbf9f', area: true }]} />
        </div>
        <div className="card terracotta">
          <div className="card-head">
            <h3>Today by apartment</h3>
            <SimBadge />
          </div>
          <BarList items={apartments.map((a, i) => ({ label: `${a.city}`, value: round1(a.energyToday), color: COLORS[i % 4] }))} />
          <div className="total-line"><span>Total spend</span><b>{totalToday} kWh</b></div>
        </div>
      </section>
    </div>
  )
}
