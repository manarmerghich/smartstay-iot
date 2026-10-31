const pad = (n) => String(n).padStart(2, '0')

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())
export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export const fmtDate = (s) =>
  new Date(`${s}T00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
export const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const fmtDateTime = (ms) =>
  new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const nightsBetween = (a, b) =>
  Math.max(1, Math.round((new Date(`${b}T00:00`) - new Date(`${a}T00:00`)) / 86400000))

// "past" | "current" | "upcoming" — derived purely from reservation dates
export function reservationState(r, today) {
  if (r.end < today) return 'past'
  if (r.start > today) return 'upcoming'
  return 'current'
}

// Apartment status is DERIVED FROM RESERVATIONS (not from the presence sensor)
export function apartmentStatus(apt, reservations, today) {
  const current = reservations.find(
    (r) => r.apartmentId === apt.id && reservationState(r, today) === 'current',
  )
  if (current) return { key: 'occupied', label: 'Reserved / Occupied', reservation: current }
  if (apt.cleaning) return { key: 'cleaning', label: 'Cleaning' }
  return { key: 'available', label: 'Available' }
}

export function nextReservation(aptId, reservations, today) {
  return reservations
    .filter((r) => r.apartmentId === aptId && r.start > today)
    .sort((a, b) => a.start.localeCompare(b.start))[0]
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0)
export const round1 = (n) => Math.round(n * 10) / 10
export const round2 = (n) => Math.round(n * 100) / 100

export const COLORS = ['#8fbf9f', '#d49a82', '#a7a7cf', '#c8c37a']

export function weekLabels() {
  const t = new Date()
  return Array.from({ length: 7 }, (_, i) =>
    addDays(t, i - 6).toLocaleDateString('en-GB', { weekday: 'short' }),
  )
}
