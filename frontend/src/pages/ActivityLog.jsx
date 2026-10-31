import { useState } from 'react'
import { fmtDateTime } from '../utils/helpers'

export default function ActivityLog({ logs, apartments }) {
  const [filter, setFilter] = useState('all')
  const name = (id) => apartments.find((a) => a.id === id)
  const shown = logs.filter((l) => filter === 'all' || l.apartmentId === filter)

  return (
    <div className="page">
      <div className="page-actions">
        <p className="muted">Every command is time-stamped: who, where, what, and whether the server accepted it.</p>
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by apartment">
          <option value="all">All apartments</option>
          {apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <section className="card">
        {shown.length === 0 ? (
          <p className="muted">No activity yet. Lock a door, change the A/C or open a window to create log entries.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date / time</th><th>Apartment</th><th>User</th><th>Command</th><th>Result</th></tr></thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDateTime(l.time)}</td>
                    <td>{name(l.apartmentId)?.name}<br /><small className="muted">{name(l.apartmentId)?.city}</small></td>
                    <td>{l.user}{l.source === 'automation' && <span className="badge b-info">auto</span>}</td>
                    <td>{l.command}</td>
                    <td><span className={`badge ${l.result === 'success' ? 'b-ok' : 'b-err'}`}>{l.result === 'success' ? 'Success' : 'Rejected'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
