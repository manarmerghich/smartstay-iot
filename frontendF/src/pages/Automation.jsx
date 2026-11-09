import Icon from '../components/Icons'
import Toggle from '../components/Toggle'
import { fmtDateTime } from '../utils/helpers'

export default function Automation({ rules, onToggle, logs, apartments }) {
  const name = (id) => apartments.find((a) => a.id === id)?.name
  return (
    <div className="page">
      <p className="muted">Rules run automatically on every sensor update. Each trigger is written to the activity log.</p>
      <div className="rules">
        {rules.map((r) => {
          const hits = logs.filter((l) => l.ruleId === r.id)
          return (
            <section className={`card rule ${r.enabled ? '' : 'rule-off'}`} key={r.id}>
              <div className="card-head">
                <h3><Icon name="automation" size={18} /> {r.name}</h3>
                <Toggle checked={r.enabled} onChange={() => onToggle(r.id)} label={`Enable rule ${r.name}`} />
              </div>
              <p className="muted">{r.description}</p>
              <div className="rule-flow">
                <div className="flow-col">
                  <small>IF (all true)</small>
                  {r.conditions.map((c) => <span key={c} className="flow-chip">{c}</span>)}
                </div>
                <Icon name="chevron" className="flow-arrow" />
                <div className="flow-col">
                  <small>THEN</small>
                  <span className="flow-chip accent">{r.action}</span>
                </div>
              </div>
              <div className="rule-hits">
                <b>{hits.length}</b> trigger{hits.length === 1 ? '' : 's'} this session
                {hits[0] && <small> · last: {name(hits[0].apartmentId)} at {fmtDateTime(hits[0].time)}</small>}
              </div>
            </section>
          )
        })}
      </div>
      <section className="card">
        <h3>How to demo a rule</h3>
        <p className="muted">
          Open the <b>Riad Atlas Suite</b> (Fès): the A/C is on. Re-open its window — the “Save energy” rule closes it again
          within a second and logs the action as <i>Automation</i>.
        </p>
      </section>
    </div>
  )
}
