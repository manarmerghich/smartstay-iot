import { useState } from 'react'
import Icon from './Icons'
import { describeDetail, fmtTime } from '../utils/helpers'
import { useI18n } from '../i18n/useI18n'
import { USE_MOCK } from '../services/api'

const KEYS = ['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D']
const MAX = 10

// Access control: 4x4 keypad of the ESP32 (digits 0-9, max 10 digits, * clears, # sends the code to the server).
// Demo mode: the keypad is clickable. Real mode: the physical keypad is used, attempts come from the server log.
export default function KeypadPanel({ aptId, logs, interactive, onSubmit }) {
  const { t, lang } = useI18n()
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const attempts = logs.filter((l) => l.apartment_id === aptId && (l.actor_type === 'keypad' || l.action === 'verify_code')).slice(0, 4)

  const press = async (k) => {
    if (!interactive) return
    if (/^\d$/.test(k)) { if (code.length < MAX) setCode(code + k); return }
    if (k === '*') { setCode(''); setMsg(null); return }
    if (k === '#') {
      if (!code) return setMsg({ type: 'warn', key: 'keypad.enter' })
      const r = await onSubmit(aptId, code)
      setCode('')
      if (r.result === 'error') return
      setMsg(r.result === 'open' ? { type: 'ok', key: r.test ? 'keypad.valid' : 'keypad.open' } : { type: 'err', key: 'keypad.denied' })
    }
  }

  return (
    <div className="keypad-panel">
      <div className="keypad-device">
        <div className="keypad-screen" dir="ltr">
          {code ? code.split('').map((d, i) => <span key={i}>{d}</span>) : <em>{t('keypad.placeholder')}</em>}
          <small>{code.length}/{MAX}</small>
        </div>
        <div className="keypad-grid">
          {KEYS.map((k) => (
            <button key={k} className={`key ${/[A-D]/.test(k) ? 'key-off' : ''} ${k === '#' ? 'key-send' : ''} ${k === '*' ? 'key-clear' : ''}`}
              disabled={!interactive || /[A-D]/.test(k)} onClick={() => press(k)} aria-label={k}>{k}</button>
          ))}
        </div>
      </div>
      <div className="keypad-info">
        <ul className="keypad-rules">
          <li><b>0–9</b> {t('keypad.rule.digits', { n: MAX })}</li>
          <li><b>*</b> {t('keypad.rule.clear')}</li>
          <li><b>#</b> {t('keypad.rule.send')}</li>
        </ul>
        {msg && <p className={`keypad-msg ${msg.type}`} role="status">{t(msg.key)}</p>}
        <p className="muted">{USE_MOCK ? t('keypad.demoHint') : t('keypad.testHint')}</p>
        <h4>{t('keypad.recent')}</h4>
        {attempts.length === 0 ? <p className="muted">{t('keypad.none')}</p> : (
          <ul className="attempts">
            {attempts.map((l) => (
              <li key={l.id ?? l.ts} className={l.result === 'accepted' ? 'ok' : 'err'}>
                <Icon name={l.result === 'accepted' ? 'unlock' : 'lock'} size={14} />
                <span>{l.result === 'accepted' ? t(l.action === 'verify_code' ? 'keypad.valid' : 'keypad.open') : t('keypad.denied')}{describeDetail(l.detail, t) && l.result !== 'accepted' ? ` — ${describeDetail(l.detail, t)}` : ''}</span>
                <small>{fmtTime(l.ts, lang)}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
