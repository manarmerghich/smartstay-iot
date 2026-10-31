import SimBadge from './SimBadge'
import Icon from './Icons'
import { USE_MOCK } from '../services/api'

export default function Header({ title, subtitle, user, users, onUserChange, onMenu }) {
  return (
    <header className="header">
      <div className="header-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="header-actions">
        <SimBadge text={USE_MOCK ? 'Demo mode · simulated data' : 'Simulation connected'} />
        <label className="user-select">
          <span className="avatar" style={{ background: user.avatar }}><Icon name="user" size={17} /></span>
          <span className="user-meta">
            <select value={user.id} onChange={(e) => onUserChange(e.target.value)} aria-label="Signed-in user (demo)">
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
            <small>Signed in (demo)</small>
          </span>
          <Icon name="chevron" size={16} />
        </label>
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open activity panel">
          <Icon name="menu" />
        </button>
      </div>
    </header>
  )
}
