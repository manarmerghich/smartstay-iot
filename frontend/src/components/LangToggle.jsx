import Icon from './Icons'
import { useI18n } from '../i18n/useI18n'

// One click switches the whole interface between English and Darija (العربية الدارجة)
export default function LangToggle() {
  const { lang, toggle, t } = useI18n()
  return (
    <button className="lang-btn" onClick={toggle} aria-label={t('lang.switch')} title={t('lang.switch')}>
      <Icon name="globe" size={16} />
      <span className={lang === 'en' ? 'on' : ''}>EN</span>
      <span className="sep">|</span>
      <span className={`ar ${lang === 'ary' ? 'on' : ''}`}>دارجة</span>
    </button>
  )
}
