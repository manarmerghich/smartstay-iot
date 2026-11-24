import { useState } from 'react'
import ApartmentCard from '../components/ApartmentCard'
import { LineChart, BarList } from '../components/Charts'
import Icon from '../components/Icons'
import SimBadge from '../components/SimBadge'
import { OUTSIDE_TEMP } from '../data/mockData'
import { COLORS, round1, sum, weekLabels } from '../utils/helpers'
import { useI18n } from '../i18n/useI18n'

export default function Dashboard({ apartments, alerts, energy, onOpen }) {
  const { t, city, lang } = useI18n()
  const [filter, setFilter] = useState('All')
  const cities = ['All', ...new Set(apartments.map((a) => a.city))]
  const shown = apartments.filter((a) => filter === 'All' || a.city === filter)

  const occupied = apartments.filter((a) => a.status === 'occupied').length
  const cleaning = apartments.filter((a) => a.status === 'cleaning').length
  const unlocked = apartments.filter((a) => a.door === 'unlocked').length
  const totalToday = round1(energy.today_total)
  const avgOutside = Math.round(sum(apartments.map((a) => OUTSIDE_TEMP[a.city] ?? 25)) / apartments.length)
  const totals = Array.from({ length: 7 }, (_, i) => round1(sum(energy.apartments.map((e) => [...e.history, e.today][i] ?? 0))))
  const name = (id) => apartments.find((a) => a.id === id)?.name

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-content">
          <small>{new Date().toLocaleDateString(lang === 'ary' ? 'ar-MA-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</small>
          <h2>{t('hero.welcome')}</h2>
          <span className="greet">{lang === 'en' ? 'Marhba bik · مرحبا بيك' : 'Marhba bik'}</span>
          <p>
            {t('hero.summary', { n: apartments.length, c: cities.length - 1 })}{' '}
            {alerts.length === 0 ? t('hero.ok') : t('hero.attention', { n: alerts.length })}
          </p>
          <div className="hero-stats">
            <div><Icon name="thermo" size={18} /><b dir="ltr">{avgOutside}°C</b><small>{t('hero.outdoor')}</small></div>
            <div><Icon name="bolt" size={18} /><b>{totalToday}</b><small>{t('m.kwhToday')}</small></div>
          </div>
        </div>
      </section>

      <section className="kpis">
        <div className="kpi"><span className="kpi-icon"><Icon name="building" /></span><div><b>{apartments.length}</b><small>{t('kpi.apartments')}</small></div></div>
        <div className="kpi"><span className="kpi-icon red"><Icon name="calendar" /></span><div><b>{occupied}</b><small>{t('kpi.occupied')}</small></div></div>
        <div className="kpi"><span className="kpi-icon amber"><Icon name="broom" /></span><div><b>{cleaning}</b><small>{t('kpi.cleaning')}</small></div></div>
        <div className={`kpi ${unlocked ? 'kpi-warn' : ''}`}><span className="kpi-icon amber"><Icon name={unlocked ? 'unlock' : 'lock'} /></span><div><b>{unlocked}</b><small>{t('kpi.unlocked')}</small></div></div>
      </section>

      {alerts.length > 0 && (
        <section className="alerts" aria-label={t('alerts.label')}>
          <Icon name="alert" size={18} />
          <ul>{alerts.map((a) => <li key={a.apartment_id}>{name(a.apartment_id)}: {t('alerts.acWindow')}</li>)}</ul>
        </section>
      )}

      <div className="tabs" role="tablist">
        {cities.map((c) => (
          <button key={c} role="tab" aria-selected={filter === c} className={`tab ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>
            {c === 'All' ? t('all') : city(c)}
          </button>
        ))}
      </div>

      <section className="apt-grid">
        {shown.map((apt) => <ApartmentCard key={apt.id} apt={apt} onOpen={onOpen} />)}
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-head"><h3>{t('dash.total7')}</h3><SimBadge /></div>
          <LineChart labels={weekLabels(lang)} series={[{ label: t('dash.all'), values: totals, color: '#d8aa62', area: true }]} />
        </div>
        <div className="card burgundy">
          <div className="card-head"><h3>{t('dash.today')}</h3><SimBadge /></div>
          <BarList items={apartments.map((a, i) => ({ label: a.name, value: round1(energy.apartments.find((e) => e.apartment_id === a.id)?.today ?? a.energyToday), color: COLORS[i % COLORS.length] }))} />
          <div className="total-line"><span>{t('dash.total')}</span><b>{totalToday} kWh</b></div>
        </div>
      </section>
    </div>
  )
}
