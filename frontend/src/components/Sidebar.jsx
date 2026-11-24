import Icon from './Icons'
import { NAV } from '../data/nav'
import { useI18n } from '../i18n/useI18n'
import './Sidebar.css'

const TAGLINE = {
  en: 'Moroccan Traditional Smart Home',
  ary: 'الدار المغربية الذكية',
}

export default function Sidebar({ page, onNavigate }) {
  const { t, lang } = useI18n()
  return (
    <nav className="sidebar ss-sidebar" aria-label={t('nav.main')}>
      {/* golden zellige in the corners */}
      <span className="ss-corner ss-corner--top" aria-hidden="true" />
      <span className="ss-corner ss-corner--bottom" aria-hidden="true" />

      <div className="ss-brand" title="SmartStay">
        <img className="ss-brand-logo" src="/images/sidebar/logo-smartstay.svg" alt="" width="96" height="67" />
        <p className="ss-brand-name">Smart<span>Stay</span> IoT</p>
        <p className="ss-brand-tag">{TAGLINE[lang] ?? TAGLINE.en}</p>
      </div>

      <div className="ss-divider" aria-hidden="true">
        <svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
          <path d="M20 3l4.2 7.5 8.3-1.8-1.8 8.3L38 20l-7.3 3-.2 0 1.8 8.3-8.3-1.8L20 37l-4.2-7.5-8.3 1.8 1.8-8.3L2 20l7.3-3.1-1.8-8.3 8.3 1.8z" />
          <rect x="14" y="14" width="12" height="12" transform="rotate(45 20 20)" />
          <circle cx="20" cy="20" r="2.4" fill="currentColor" stroke="none" />
        </svg>
      </div>

      <ul>
        {NAV.map((n) => (
          <li key={n.id}>
            <button
              className={`nav-btn ${page === n.id ? 'active' : ''}`}
              onClick={() => onNavigate(n.id)}
              aria-label={t(n.key)}
              aria-current={page === n.id ? 'page' : undefined}
              title={t(n.key)}
            >
              <Icon name={n.icon} size={22} strokeWidth={1.6} />
              <span className="nav-label">{t(n.key)}</span>
            </button>
          </li>
        ))}
      </ul>

      {/* Moroccan gate at night, palms and a lit path */}
      <div className="ss-gate" aria-hidden="true" />
    </nav>
  )
}
