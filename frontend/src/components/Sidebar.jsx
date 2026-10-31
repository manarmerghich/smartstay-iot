import Icon from './Icons'
import { NAV } from '../data/nav'


export default function Sidebar({ page, onNavigate }) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="logo" title="SmartStay IoT">
        <Icon name="home" size={22} strokeWidth={2} />
      </div>
      <ul>
        {NAV.map((n) => (
          <li key={n.id}>
            <button
              className={`nav-btn ${page === n.id ? 'active' : ''}`}
              onClick={() => onNavigate(n.id)}
              aria-label={n.label}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <Icon name={n.icon} />
              <span className="tooltip">{n.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
