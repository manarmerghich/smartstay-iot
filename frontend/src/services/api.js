import { initialApartments } from '../data/mockData'

// frontend/.env :  VITE_API_URL=http://localhost:8000   (without /api)
// If VITE_API_URL is empty the dashboard stays in demo mode (simulated data).
const API_URL = import.meta.env.VITE_API_URL || ''
export const USE_MOCK = !API_URL

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/* ───────────── Session ─────────────
   The server identifies the user from the token: the browser never chooses its own role. */
const KEY = 'smartstay-session'
let session = null
if (!USE_MOCK) {
  try { session = JSON.parse(sessionStorage.getItem(KEY)) } catch { session = null }
}
let onUnauthorized = () => {}
export const setOnUnauthorized = (fn) => { onUnauthorized = fn }
export const getSession = () => session
export const logout = () => {
  session = null
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** POST /auth/login -> { token, role, name } */
export async function login(email, password) {
  let res
  try {
    res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    const e = new Error('unavailable'); e.status = 0; throw e
  }
  if (!res.ok) { const e = new Error('login'); e.status = res.status; throw e }
  session = await res.json()
  try { sessionStorage.setItem(KEY, JSON.stringify(session)) } catch { /* ignore */ }
  return session
}

/* ───────────── Generic request ─────────────
   Throws an Error with .status (0 = server down, 401, 403, 404, 409, 422, 503…) and .detail. */
async function request(path, { method = 'GET', body } = {}) {
  if (!session) { const e = new Error('Not signed in'); e.status = 401; throw e }
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    const e = new Error('API unavailable'); e.status = 0; throw e
  }
  if (res.status === 401) { logout(); onUnauthorized() }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const e = new Error(typeof data.detail === 'string' ? data.detail : `Server error (${res.status})`)
    e.status = res.status
    e.detail = data.detail
    throw e
  }
  return res.status === 204 ? null : res.json().catch(() => null)
}

/* ───────────── Apartments and commands ───────────── */

// Server (maison1..6: measurement, devices, energy) -> shape used by the dashboard.
// name / photo / address come from initialApartments, matched by id (maisonN).
function toDashboard(a) {
  const base = initialApartments.find((x) => x.id === a.id) || {}
  const m = a.measurement
  return {
    ...base,
    id: a.id,
    name: base.name || a.name,
    city: a.city,
    status: a.status,                        // cleaning | occupied | reserved | available
    cleaning: a.status === 'cleaning',
    door: a.devices.door,
    window: a.devices.window,
    ac: a.devices.ac,
    temperature: m ? m.temperature : base.temperature,
    humidity: m ? m.humidity : base.humidity,
    presence: m ? m.presence : base.presence,
    lastUpdate: m ? m.recorded_at : null,
    energyHistory: a.energy.history,
    energyToday: a.energy.today,
  }
}

export const fetchApartments = async () => (await request('/apartments')).map(toDashboard)

// The server expects ONE field at a time: {door} | {window} | {on} | {target} | {mode}
function toBody(device, value) {
  if (device === 'door') return { door: value }
  if (device === 'window') return { window: value }
  return value // ac: {on:true} / {target:24} / {mode:'cool'}
}

/** POST /apartments/{id}/commands -> { ok:true, devices } | { ok:false, status, detail } */
export async function sendCommand({ apartmentId, device, value }) {
  if (USE_MOCK) {
    await delay(300)
    return { ok: true }
  }
  try {
    const devices = await request(`/apartments/${apartmentId}/commands`, { method: 'POST', body: toBody(device, value) })
    return { ok: true, devices }
  } catch (e) {
    return { ok: false, status: e.status, detail: e.detail }
  }
}

/** POST /apartments/{id}/cleaning */
export const setCleaning = (apartmentId, cleaning) =>
  request(`/apartments/${apartmentId}/cleaning`, { method: 'POST', body: { cleaning } })

/** GET /apartments/{id}/measurements -> [{ recorded_at, temperature, humidity, presence }] (latest first) */
export const fetchMeasurements = (apartmentId, limit = 60) =>
  request(`/apartments/${apartmentId}/measurements?limit=${limit}`)

/* ───────────── Energy (F6) ─────────────
   GET /energy -> { apartments:[{ apartment_id, today, history[6], days[7], week_total, simulated }],
                    today_total, week_total, unit:'kWh', simulated:true } */
export const fetchEnergy = () => request('/energy')

/* ───────────── Rules, logs ───────────── */
export const fetchRules = () => request('/rules')
export const setRule = (ruleId, enabled) => request(`/rules/${ruleId}`, { method: 'PUT', body: { enabled } })
export const fetchLogs = ({ limit = 100 } = {}) => request(`/logs?limit=${limit}`)

/* ───────────── Reservations ─────────────
   { apartment_id:'maison1', reference:'Booking #1035', check_in:'2026-11-17T15:00:00+01:00', check_out:'…' }
   409 = overlap, 422 = check-out before check-in. */
export const fetchReservations = () => request('/reservations')
export const createReservation = (body) => request('/reservations', { method: 'POST', body })
export const updateReservation = (id, body) => request(`/reservations/${id}`, { method: 'PUT', body })
export const deleteReservation = (id) => request(`/reservations/${id}`, { method: 'DELETE' })

/* ───────────── Access codes ───────────── */
export const createAccessCode = (reservationId) => request(`/reservations/${reservationId}/access-code`, { method: 'POST' })
export const fetchAccessCodes = (reservationId) => request(`/reservations/${reservationId}/access-codes`)
/** POST /access/verify -> { result:'open'|'denied', reason } — manual check (the Wokwi keypad goes through MQTT) */
export const verifyCode = (apartmentId, code) => request('/access/verify', { method: 'POST', body: { apartment_id: apartmentId, code } })
export const cancelAccessCode = (codeId) => request(`/access-codes/${codeId}/cancel`, { method: 'POST' })
