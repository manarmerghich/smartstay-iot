import { useState } from 'react'
import { useI18n } from '../i18n/useI18n'
import { describeAction, describeDetail, fmtDateTime } from '../utils/helpers'

export default function ActivityLog({ logs, apartments }) {
  const { t, city, lang } = useI18n()
  const [filter, setFilter] = useState('all')
  const apt = (id) => apartments.find((a) => a.id === id)
  const shown = logs.filter((l) => filter === 'all' || l.apartment_id === filter)

  const who = (l) => {
    if (l.actor_type === 'automation') return `${t('who.automation')}${l.rule ? ` · ${t(`rule.${l.rule}.name`)}` : ''}`
    if (l.actor_type === 'keypad') return t('who.keypad')
    return t('role.owner')
  }

  return (
    <div className="page">
      <div className="page-actions">
        <p className="muted">{t('log.intro')}</p>
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('log.filter')}>
          <option value="all">{t('log.allApts')}</option>
          {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <section className="card">
        {shown.length === 0 ? <p className="muted">{t('log.empty')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>{t('col.datetime')}</th><th>{t('col.apartment')}</th><th>{t('col.user')}</th><th>{t('col.command')}</th><th>{t('col.result')}</th>
              </tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id ?? `${l.ts}-${l.action}`}>
                    <td>{fmtDateTime(l.ts, lang)}</td>
                    <td>{apt(l.apartment_id)?.name ?? '—'}<br /><small className="muted">{apt(l.apartment_id) && city(apt(l.apartment_id).city)}</small></td>
                    <td>{who(l)}{l.actor_type === 'automation' && <span className="badge b-info">auto</span>}</td>
                    <td>{describeAction(l.action, t)}{describeDetail(l.detail, t) && l.result !== 'accepted' ? <><br /><small className="muted">{describeDetail(l.detail, t)}</small></> : null}</td>
                    <td><span className={`badge ${l.result === 'accepted' ? 'b-ok' : 'b-err'}`}>{t(l.result === 'accepted' ? 'res.ok' : 'res.refused')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
