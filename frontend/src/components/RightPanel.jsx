import Icon from './Icons'
import Toggle from './Toggle'
import { fmtTime } from '../utils/helpers'

export default function RightPanel({ rules, onToggleRule, users, currentUser, logs, apartments, open, onClose, onNavigate }) {
  const name = (id) => apartments.find((a) => a.id === id)?.name ?? id
  return (
    <>
      {open && <div className="backdrop" onClick={onClose} />}
      <aside className={`right-panel ${open ? 'open' : ''}`} aria-label="Automations, team and recent activity">
        <section className="rp-section">
          <div className="rp-head">
            <h2>Automation</h2>
            <button className="icon-btn light" onClick={() => onNavigate('automation')} aria-label="Manage automation rules">
              <Icon name="plus" size={18} />
            </button>
          </div>
          {rules.map((r) => (
            <div className="rule-mini" key={r.id}>
              <div>
                <b>{r.name}</b>
                <small>{r.conditions.join(' + ')} → {r.action}</small>
              </div>
              <Toggle checked={r.enabled} onChange={() => onToggleRule(r.id)} label={`Enable rule ${r.name}`} />
            </div>
          ))}
        </section>

        <section className="rp-section">
          <div className="rp-head"><h2>Team & roles</h2></div>
          <div className="team">
            {users.map((u) => (
              <div key={u.id} className={`member ${u.id === currentUser.id ? 'me' : ''}`}>
                <span className="avatar big" style={{ background: u.avatar }}><Icon name="user" size={20} /></span>
                <b>{u.label}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="rp-section">
          <div className="rp-head">
            <h2>Recent commands</h2>
            <button className="link-btn" onClick={() => onNavigate('logs')}>See all</button>
          </div>
          {logs.length === 0 && <p className="muted">No command sent yet. Control a device to see it here.</p>}
          <ul className="mini-log">
            {logs.slice(0, 5).map((l) => (
              <li key={l.id} className={l.result === 'rejected' ? 'rejected' : ''}>
                <span className="dot" />
                <div>
                  <b>{l.command}</b>
                  <small>{name(l.apartmentId)} · {l.user} · {fmtTime(l.time)}</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </>
  )
}
