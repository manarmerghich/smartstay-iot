import { useI18n } from '../i18n/useI18n'

export default function StatusPill({ status }) {
  const { t } = useI18n()
  return <span className={`pill pill-${status}`}>{t(`status.${status}`)}</span>
}
