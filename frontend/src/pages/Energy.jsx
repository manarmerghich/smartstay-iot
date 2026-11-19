import { BarList, LineChart } from '../components/Charts'
import SimBadge from '../components/SimBadge'
import { COLORS, locale, round1 } from '../utils/helpers'
import { useI18n } from '../i18n/useI18n'

// Data = GET /energy (backend): per apartment today + 6 previous days, totals, unit.
export default function Energy({ apartments, energy }) {
  const { t, city, lang } = useI18n()
  const items = energy.apartments
  const labels = (items[0]?.days ?? []).map((d) => new Date(`${d}T12:00:00`).toLocaleDateString(locale(lang), { weekday: 'short' }))
  const name = (id) => apartments.find((a) => a.id === id)
  const series = items.map((e, i) => ({
    label: name(e.apartment_id)?.name ?? e.apartment_id, color: COLORS[i % COLORS.length], values: [...e.history, e.today],
  }))
  const weekTotals = items.map((e, i) => ({
    label: `${name(e.apartment_id)?.name ?? e.apartment_id} (${city(name(e.apartment_id)?.city)})`, value: round1(e.week_total), color: COLORS[i % COLORS.length],
  }))
  const top = [...weekTotals].sort((a, b) => b.value - a.value)[0]
  const unit = energy.unit || 'kWh'

  return (
    <div className="page">
      <div className="kpis">
        <div className="kpi"><div><b>{round1(energy.today_total)}</b><small>{t('en.today')}</small></div></div>
        <div className="kpi"><div><b>{round1(energy.week_total)}</b><small>{t('en.week')}</small></div></div>
        <div className="kpi"><div><b>{round1(energy.week_total / 7)}</b><small>{t('en.avg')}</small></div></div>
        <div className="kpi kpi-warn"><div><b>{top?.label.split(' (')[0]}</b><small>{t('en.top')}</small></div></div>
      </div>

      <section className="card">
        <div className="card-head"><h3>{t('en.daily')}</h3><SimBadge text={t('sim.kwh')} /></div>
        <LineChart labels={labels} series={series} unit={unit} />
        <div className="legend">
          {series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <div className="card-head"><h3>{t('en.compare')}</h3><SimBadge /></div>
          <BarList items={weekTotals} unit={unit} />
        </div>
        <div className="card">
          <div className="card-head"><h3>{t('en.details')}</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('col.apartment')}</th><th>{t('col.city')}</th><th>{t('col.today')}</th><th>{t('col.7days')}</th></tr></thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.apartment_id}>
                    <td>{name(e.apartment_id)?.name}</td><td>{city(name(e.apartment_id)?.city)}</td>
                    <td>{e.today.toFixed(2)} {unit}</td><td>{e.week_total.toFixed(2)} {unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">{t('en.note')}</p>
        </div>
      </section>
    </div>
  )
}
