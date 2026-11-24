import { useState } from 'react'
import Icon from '../components/Icons'
import LangToggle from '../components/LangToggle'
import SimBadge from '../components/SimBadge'
import { OWNER_EMAIL } from '../data/mockData'
import { USE_MOCK } from '../services/api'
import { useI18n } from '../i18n/useI18n'

export default function Login({ onSignIn, onDemo }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setBusy(true)
    try { await onSignIn(email.trim(), password) } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <div className="login">
      <div className="login-photo" style={{ backgroundImage: 'url(/images/login-photo.jpg)' }}>
        <div className="login-photo-shade" />
        <div className="login-brand">
          <span className="brand-mark"><Icon name="logo" size={26} strokeWidth={1.6} /></span>
          <h2>SmartStay</h2>
          <span className="greet">Marhba bik · مرحبا بيك</span>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-top"><LangToggle /></div>
        <div className="login-card">
          <h1>{t('login.submit')}</h1>
          <p className="muted">{t('login.subtitle')}</p>

          {USE_MOCK ? (
            <>
              <SimBadge text={t('sim.demo')} />
              <button className="btn btn-primary wide" onClick={onDemo}><Icon name="shield" size={18} /> {t('login.owner')}</button>
            </>
          ) : (
            <form onSubmit={submit} className="login-form">
              <label>{t('login.email')}
                <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>{t('login.password')}
                <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && <p className="warn-text" role="alert">{error}</p>}
              <button className="btn btn-primary wide" disabled={busy}>{busy ? t('login.wait') : t('login.submit')}</button>
              <div className="demo-chips">
                <small>{t('login.demo')}</small>
                <button type="button" className="chip-btn" onClick={() => { setEmail(OWNER_EMAIL); setPassword('demo1234') }}>{t('role.owner')}</button>
              </div>
            </form>
          )}
        </div>
        <div className="zellige-band" aria-hidden="true" />
      </div>
    </div>
  )
}
