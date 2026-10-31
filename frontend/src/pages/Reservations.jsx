import { useState } from 'react'
import Icon from '../components/Icons'
import StatusPill from '../components/StatusPill'
import { fmtDate, nightsBetween, reservationState, todayISO } from '../utils/helpers'

const STATE_LABEL = { current: ['occupied', 'In progress'], upcoming: ['available', 'Upcoming'], past: ['cleaning', 'Completed'] }

export default function Reservations({ apartments, reservations, onSave, onDelete, notify }) {
  const today = todayISO()
  const empty = { id: '', apartmentId: apartments[0].id, guest: '', start: today, end: today }
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const name = (id) => apartments.find((a) => a.id === id)

  const sorted = [...reservations].sort((a, b) => a.start.localeCompare(b.start))

  const submit = (e) => {
    e.preventDefault()
    if (!form.guest.trim()) return setError('Please enter a guest name.')
    if (form.end < form.start) return setError('The end date must be after the start date.')
    const overlap = reservations.some((r) => r.id !== form.id && r.apartmentId === form.apartmentId && r.start <= form.end && form.start <= r.end)
    if (overlap) return setError('These dates overlap another reservation for this apartment.')
    onSave({ ...form, id: form.id || `r${Date.now()}`, guest: form.guest.trim() })
    notify(form.id ? 'Reservation updated' : 'Reservation created')
    setForm(null); setError('')
  }

  return (
    <div className="page">
      <div className="page-actions">
        <p className="muted">Demo reservations (fictional guests). The apartment status is computed from these dates — not from the presence sensor.</p>
        <button className="btn btn-primary" onClick={() => { setForm(empty); setError('') }}><Icon name="plus" size={16} /> New reservation</button>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Apartment</th><th>Booking</th><th>Dates</th><th>Nights</th><th>Status</th><th /></tr></thead>
            <tbody>
              {sorted.map((r) => {
                const [k, l] = STATE_LABEL[reservationState(r, today)]
                const a = name(r.apartmentId)
                return (
                  <tr key={r.id}>
                    <td><b>{a?.name}</b><br /><small className="muted">{a?.city}</small></td>
                    <td>{r.guest}</td>
                    <td>{fmtDate(r.start)} → {fmtDate(r.end)}</td>
                    <td>{nightsBetween(r.start, r.end)}</td>
                    <td><StatusPill status={k}>{l}</StatusPill></td>
                    <td className="row-actions">
                      <button className="icon-btn light" onClick={() => { setForm(r); setError('') }} aria-label="Edit reservation"><Icon name="edit" size={16} /></button>
                      <button className="icon-btn light" onClick={() => { onDelete(r.id); notify('Reservation deleted') }} aria-label="Delete reservation"><Icon name="trash" size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="card-head">
              <h3>{form.id ? 'Edit reservation' : 'New reservation'}</h3>
              <button type="button" className="icon-btn light" onClick={() => setForm(null)} aria-label="Close"><Icon name="x" size={18} /></button>
            </div>
            <label>Apartment
              <select value={form.apartmentId} onChange={(e) => setForm({ ...form, apartmentId: e.target.value })}>
                {apartments.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.city}</option>)}
              </select>
            </label>
            <label>Booking reference (fictional)
              <input value={form.guest} onChange={(e) => setForm({ ...form, guest: e.target.value })} placeholder="e.g. Booking #1035" />
            </label>
            <div className="two-cols">
              <label>Check-in<input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label>
              <label>Check-out<input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>
            </div>
            {error && <p className="warn-text" role="alert">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
