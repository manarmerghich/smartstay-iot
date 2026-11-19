import SimBadge from './SimBadge'
import LangToggle from './LangToggle'
import Icon from './Icons'
import { USE_MOCK } from '../services/api'
import { useI18n } from '../i18n/useI18n'

export default function Header({ title, subtitle, onLogout, onMenu }) {
  const { t } = useI18n()
  return (
    <header className="header">
      <div className="header-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="header-actions">
        <SimBadge text={USE_MOCK ? t('sim.demo') : t('sim.connected')} />
        <LangToggle />
        <div className="user-chip">
          <span className="avatar"><Icon name="user" size={17} /></span>
          <span className="user-meta"><b>{t('role.owner')}</b><small>{t('header.signedIn')}</small></span>
        </div>
        <button className="icon-btn" onClick={onLogout} aria-label={t('header.logout')} title={t('header.logout')}>
          <Icon name="logout" size={18} />
        </button>
        <button className="icon-btn menu-btn" onClick={onMenu} aria-label={t('header.panel')}>
          <Icon name="menu" />
        </button>
      </div>
    </header>
  )
}
