import Icon from '../components/Icons'
import Toggle from '../components/Toggle'
import { RULE_INFO } from '../data/mockData'
import { useI18n } from '../i18n/useI18n'
import { fmtDateTime } from '../utils/helpers'

export default function Automation({ rules, onToggle, apartments }) {
  const { t, lang } = useI18n()
  const name = (id) => apartments.find((a) => a.id === id)?.name
  const tr = (key, fallback) => (t(key) === key ? fallback : t(key))
  return (
    <div className="page">
      <p className="muted">{t('auto.intro')}</p>
      <div className="rules">
        {rules.map((r) => {
          const info = RULE_INFO[r.id]
          return (
            <section className={`card rule ${r.enabled ? '' : 'rule-off'}`} key={r.id}>
              <div className="card-head">
                <h3><Icon name="automation" size={18} /> {tr(`rule.${r.id}.name`, r.name)}</h3>
                <Toggle checked={r.enabled} onChange={() => onToggle(r.id)} label={r.name} />
              </div>
              <p className="muted">{tr(`rule.${r.id}.desc`, r.description)}</p>
              {info && (
                <div className="rule-flow">
                  <div className="flow-col">
                    <small>{t('auto.if')}</small>
                    {info.conditions.map((c) => <span key={c} className="flow-chip">{t(c)}</span>)}
                  </div>
                  <Icon name="chevron" className="flow-arrow" />
                  <div className="flow-col">
                    <small>{t('auto.then')}</small>
                    <span className="flow-chip accent">{t(info.action)}</span>
                  </div>
                </div>
              )}
              {r.id === 'save-energy' && !r.enabled && <small className="warn-text">{t('auto.offDefault')}</small>}
              <div className="rule-hits">
                <b>{r.triggers}</b> {t('auto.triggers')}
                {r.last_trigger && <small> · {t('auto.last')}: {name(r.last_trigger.apartment_id)} · {fmtDateTime(r.last_trigger.ts, lang)}</small>}
              </div>
            </section>
          )
        })}
      </div>
      <section className="card">
        <h3>{t('auto.demoTitle')}</h3>
        <p className="muted">{t('auto.demoText')}</p>
      </section>
    </div>
  )
}
