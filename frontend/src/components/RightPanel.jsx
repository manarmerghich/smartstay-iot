import Icon from './Icons'
import Toggle from './Toggle'
import Skyline from './Skyline'
import { useI18n } from '../i18n/useI18n'
import { describeAction, fmtTime } from '../utils/helpers'

export default function RightPanel({ rules, onToggleRule, logs, apartments, open, onClose, onNavigate }) {
  const { t, lang } = useI18n()
  const name = (id) => apartments.find((a) => a.id === id)?.name ?? id
  const ruleName = (r) => t(`rule.${r.id}.name`) === `rule.${r.id}.name` ? r.name : t(`rule.${r.id}.name`)
  return (
    <>
      {open && <div className="backdrop" onClick={onClose} />}
      <aside className={`right-panel ${open ? 'open' : ''}`} aria-label={t('panel.label')}>
        <section className="rp-section">
          <div className="rp-head">
            <h2>{t('nav.automation')}</h2>
            <button className="icon-btn light" onClick={() => onNavigate('automation')} aria-label={t('panel.manageRules')}>
              <Icon name="plus" size={18} />
            </button>
          </div>
          {rules.map((r) => (
            <div className="rule-mini" key={r.id}>
              <div>
                <b>{ruleName(r)}</b>
                <small>{t(`rule.${r.id}.short`) === `rule.${r.id}.short` ? r.description : t(`rule.${r.id}.short`)}</small>
              </div>
              <Toggle checked={r.enabled} onChange={() => onToggleRule(r.id)} label={ruleName(r)} />
            </div>
          ))}
        </section>

        <section className="rp-section">
            <div className="rp-head">
              <h2>{t('panel.recent')}</h2>
              <button className="link-btn" onClick={() => onNavigate('logs')}>{t('panel.seeAll')}</button>
            </div>
            {logs.length === 0 && <p className="muted">{t('panel.noCommands')}</p>}
            <ul className="mini-log">
              {logs.slice(0, 5).map((l) => (
                <li key={l.id} className={l.result === 'refused' ? 'rejected' : ''}>
                  <span className="dot" />
                  <div>
                    <b>{describeAction(l.action, t)}</b>
                    <small>{name(l.apartment_id)} · {fmtTime(l.ts, lang)}</small>
                  </div>
                </li>
              ))}
            </ul>
        </section>
        <Skyline className="panel-skyline" />
      </aside>
    </>
  )
}
