import { useEffect, useState } from 'react'
import Icon from '../components/Icons'
import { useI18n } from '../i18n/useI18n'
import { useNow } from '../hooks/useNow'
import { addDays, fmtDateTime, fromInputValue, nightsBetween, reservationTimeState, toInputValue } from '../utils/helpers'

const STATE_STYLE = { current: 'occupied', upcoming: 'reserved', past: 'cleaning' }

function AccessCodeModal({ reservation, apt, codes, onClose, errorText }) {
  const { t, lang } = useI18n()
  const [code, setCode] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // load the active code of this reservation (the backend stores it so it can be shown again)
  useEffect(() => {
    codes.list(reservation.id)
      .then((l) => setCode(l.find((c) => c.status === 'active') || null))
      .catch((e) => setError(errorText(e.status, e.detail)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation.id])

  const run = async (fn) => {
    setError('')
    try { setCode(await fn()) } catch (e) { setError(errorText(e.status, e.detail)) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(code.code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h3><Icon name="key" size={18} /> {t('code.title')}</h3>
          <button className="icon-btn light" onClick={onClose} aria-label={t('close')}><Icon name="x" size={18} /></button>
        </div>
        <p className="muted">{reservation.reference} · {apt?.name}<br />{fmtDateTime(reservation.check_in, lang)} → {fmtDateTime(reservation.check_out, lang)}</p>

        {code && code.status === 'active' ? (
          <>
            <div className="code-digits" dir="ltr">{code.code.split('').map((d, i) => <span key={i}>{d}</span>)}</div>
            <p className="muted">{t('code.valid')}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? t('code.copied') : t('code.copy')}</button>
              <button className="btn btn-ghost" onClick={() => run(() => codes.create(reservation.id))}>{t('code.regen')}</button>
              <button className="btn btn-outline" onClick={() => run(async () => { await codes.cancel(code.id); return null })}>{t('code.cancel')}</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">{t('code.none')}</p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => run(() => codes.create(reservation.id))}><Icon name="key" size={16} /> {t('code.generate')}</button>
            </div>
          </>
        )}
        {error && <p className="warn-text" role="alert">{error}</p>}
      </div>
    </div>
  )
}

export default function Reservations({ apartments, reservations, onSave, onCancel, codes, errorText }) {
  const { t, city, lang } = useI18n()
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [codeFor, setCodeFor] = useState(null)
  const apt = (id) => apartments.find((a) => a.id === id)
  const nowMs = useNow()
  const sorted = [...reservations].sort((a, b) => Date.parse(a.check_in) - Date.parse(b.check_in))

  const blank = () => {
    const today = toInputValue(new Date().toISOString()).slice(0, 10)
    const tomorrow = toInputValue(addDays(new Date(), 1).toISOString()).slice(0, 10)
    return { id: null, apartment_id: apartments[0].id, reference: '', check_in: `${today}T15:00`, check_out: `${tomorrow}T11:00` }
  }
  const edit = (r) => ({ id: r.id, apartment_id: r.apartment_id, reference: r.reference, check_in: toInputValue(r.check_in), check_out: toInputValue(r.check_out) })

  const submit = async (e) => {
    e.preventDefault()
    if (!form.reference.trim()) return setError(t('res.errRef'))
    if (form.check_out <= form.check_in) return setError(t('res.errOrder'))
    try {
      await onSave({ ...form, reference: form.reference.trim(), check_in: fromInputValue(form.check_in), check_out: fromInputValue(form.check_out) })
      setForm(null); setError('')
    } catch (err) { setError(errorText(err.status, err.detail)) }
  }

  return (
    <div className="page">
      <div className="page-actions">
        <p className="muted">{t('res.intro')}</p>
        <button className="btn btn-primary" onClick={() => { setForm(blank()); setError('') }}><Icon name="plus" size={16} /> {t('res.new')}</button>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th>{t('col.apartment')}</th><th>{t('col.booking')}</th><th>{t('col.checkin')}</th><th>{t('col.checkout')}</th>
              <th>{t('col.nights')}</th><th>{t('col.status')}</th><th />
            </tr></thead>
            <tbody>
              {sorted.map((r) => {
                const a = apt(r.apartment_id)
                const cancelled = r.status === 'cancelled'
                const st = reservationTimeState(r, nowMs)
                return (
                  <tr key={r.id} className={cancelled ? 'row-off' : ''}>
                    <td><b>{a?.name}</b><br /><small className="muted">{a && city(a.city)}</small></td>
                    <td>{r.reference}</td>
                    <td>{fmtDateTime(r.check_in, lang)}</td>
                    <td>{fmtDateTime(r.check_out, lang)}</td>
                    <td>{nightsBetween(r.check_in, r.check_out)}</td>
                    <td>{cancelled
                      ? <span className="pill pill-cancelled">{t('res.cancelled')}</span>
                      : <span className={`pill pill-${STATE_STYLE[st]}`}>{t(`res.${st}`)}</span>}</td>
                    <td className="row-actions">
                      {!cancelled && (
                        <>
                          <button className="icon-btn light" onClick={() => setCodeFor(r)} aria-label={t('code.title')} title={t('code.title')}><Icon name="key" size={16} /></button>
                          <button className="icon-btn light" onClick={() => { setForm(edit(r)); setError('') }} aria-label={t('edit')}><Icon name="edit" size={16} /></button>
                          <button className="icon-btn light" onClick={() => onCancel(r.id)} aria-label={t('res.cancel')} title={t('res.cancel')}><Icon name="trash" size={16} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {codeFor && <AccessCodeModal reservation={codeFor} apt={apt(codeFor.apartment_id)} codes={codes} errorText={errorText} onClose={() => setCodeFor(null)} />}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="card-head">
              <h3>{t(form.id ? 'res.edit' : 'res.new')}</h3>
              <button type="button" className="icon-btn light" onClick={() => setForm(null)} aria-label={t('close')}><Icon name="x" size={18} /></button>
            </div>
            <label>{t('col.apartment')}
              <select value={form.apartment_id} onChange={(e) => setForm({ ...form, apartment_id: e.target.value })}>
                {apartments.map((a) => <option key={a.id} value={a.id}>{a.name} — {city(a.city)}</option>)}
              </select>
            </label>
            <label>{t('res.reference')}
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Booking #1035" />
            </label>
            <div className="two-cols">
              <label>{t('col.checkin')}<input type="datetime-local" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></label>
              <label>{t('col.checkout')}<input type="datetime-local" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></label>
            </div>
            <small className="muted">{t('res.tz')}</small>
            {error && <p className="warn-text" role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>{t('cancel')}</button>
              <button type="submit" className="btn btn-primary">{t('save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
