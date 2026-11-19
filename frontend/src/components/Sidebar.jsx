import Icon from './Icons'
import { NAV } from '../data/nav'
import { useI18n } from '../i18n/useI18n'

export default function Sidebar({ page, onNavigate }) {
  const { t } = useI18n()
  return (
    <nav className="sidebar" aria-label={t('nav.main')}>
      <div className="logo" title="SmartStay"><Icon name="logo" size={24} strokeWidth={1.8} /></div>
      <ul>
        {NAV.map((n) => (
          <li key={n.id}>
            <button
              className={`nav-btn ${page === n.id ? 'active' : ''}`}
              onClick={() => onNavigate(n.id)}
              aria-label={t(n.key)}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <Icon name={n.icon} />
              <span className="tooltip">{t(n.key)}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
