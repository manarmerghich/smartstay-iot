import { PERMISSIONS } from '../data/mockData'

// If VITE_API_URL is empty, the app runs on simulated data (demo mode).
const API_URL = import.meta.env.VITE_API_URL || ''
export const USE_MOCK = !API_URL

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * GET /apartments  -> list of apartments with device states + measurements.
 * (Only called when a real backend is configured.)
 */
export async function fetchApartments() {
  const res = await fetch(`${API_URL}/apartments`)
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

/**
 * POST /apartments/{id}/commands
 * body: { device: 'door'|'ac'|'window', value, userId }
 * The backend is the source of truth: it must reject unauthorized users (FR-10).
 * Returns { ok: boolean, error?: string }
 */
export async function sendCommand({ apartmentId, device, value, user }) {
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
      body: JSON.stringify({ device, value, userId: user.id }),
    })
    if (res.status === 403) return { ok: false, error: 'Command rejected by the server (not authorized).' }
    if (!res.ok) return { ok: false, error: `Server error (${res.status}).` }
    return { ok: true, ...(await res.json().catch(() => ({}))) }
  } catch {
    return { ok: false, error: 'API unavailable. Please try again later.' }
  }
}
