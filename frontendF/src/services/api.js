import { PERMISSIONS } from '../data/mockData'

// If VITE_API_URL is empty, the app runs on simulated data (demo mode).
const API_URL = import.meta.env.VITE_API_URL || ''
export const USE_MOCK = !API_URL

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// Dashboard vocabulary  <->  MQTT contract vocabulary (docs/contrat.md)
//   door:   locked = "close"   | unlocked = "open"
//   window: closed = "close"   | open     = "open"
//   ac:     the dashboard keeps sending {on}, {target}, {mode}; the SERVER translates to on/off.
export const toWire = (device, value) => {
  if (device === 'door') return value === 'unlocked' ? 'open' : 'close'
  if (device === 'window') return value === 'open' ? 'open' : 'close'
  return value
}
const fromWire = (v) => (v === 'open' ? 'open' : 'closed')

// Turns one server record into the shape used by the UI.
// ASSUMPTION: adapt the field names below to section 6/7 of docs/contrat.md if they differ.
export function normalizeServerApartment(s) {
  const t = s.telemetry ?? s
  const ts = t.timestamp ?? s.timestamp
  const out = {
    house: Number(String(s.house ?? s.id ?? '').replace(/\D/g, '')) || undefined,
    temperature: t.temperature,
    humidity: t.humidity,
    presence: t.presence,
    door: s.door === undefined ? undefined : fromWire(s.door) === 'open' ? 'unlocked' : 'locked',
    window: s.window === undefined ? undefined : fromWire(s.window),
    lastUpdate: ts ? Date.parse(ts) : undefined,
  }
  if (s.ac !== undefined) {
    const ac = typeof s.ac === 'object' ? s.ac : { on: s.ac === 'on' || s.ac === true }
    out.ac = ac
  }
  return out
}

/**
 * GET /apartments -> the 6 houses with device states + latest telemetry
 * (temperature, humidity, presence + date/time added by the server).
 */
export async function fetchApartments() {
  const res = await fetch(`${API_URL}/apartments`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : data.apartments ?? []).map(normalizeServerApartment)
}

/**
 * POST /apartments/{id}/commands
 * body: { house: N, device: 'door'|'ac'|'window', value, userId }
 * door/window values are sent as "open"/"close"; ac as {on} / {target} / {mode}.
 * The backend is the source of truth: it must reject unauthorized users (FR-10).
 * Returns { ok: boolean, error?: string }
 */
export async function sendCommand({ apartmentId, house, device, value, user }) {
  if (USE_MOCK) {
    await delay(300) // simulated network latency
    if (!PERMISSIONS[user.role]?.includes(device)) {
      return { ok: false, error: `${user.label} is not authorized to control the ${device}.` }
    }
    return { ok: true }
  }
  try {
    const res = await fetch(`${API_URL}/apartments/${apartmentId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ house, device, value: toWire(device, value), userId: user.id }),
    })
    if (res.status === 403) return { ok: false, error: 'Command rejected by the server (not authorized).' }
    if (!res.ok) return { ok: false, error: `Server error (${res.status}).` }
    return { ok: true, ...(await res.json().catch(() => ({}))) }
  } catch {
    return { ok: false, error: 'API unavailable. Please try again later.' }
  }
}
