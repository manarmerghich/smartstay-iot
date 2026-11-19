const pad = (n) => String(n).padStart(2, '0')

export const TZ = 'Africa/Casablanca'
const LOCALES = { en: 'en-GB', ary: 'ar-MA-u-nu-latn' }
export const locale = (lang) => LOCALES[lang] || 'en-GB'

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

// ---- date / time formatting (Morocco time zone, Latin digits in both languages) ----
export const fmtDate = (v, lang = 'en') =>
  new Date(v).toLocaleDateString(locale(lang), { day: '2-digit', month: 'short', timeZone: TZ })
export const fmtHM = (v, lang = 'en') =>
  new Date(v).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit', timeZone: TZ })
export const fmtTime = (v, lang = 'en') =>
  new Date(v).toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ })
export const fmtDateTime = (v, lang = 'en') =>
  new Date(v).toLocaleString(locale(lang), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })

// <input type="datetime-local"> <-> ISO with Morocco offset (+01:00), as required by the backend
export const toInputValue = (iso) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso)).replace(' ', 'T')
export const fromInputValue = (v) => `${v}:00+01:00`

export const nightsBetween = (a, b) =>
  Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000))

// "past" | "current" | "upcoming" — derived from the reservation period
export function reservationTimeState(r, nowMs) {
  if (Date.parse(r.check_out) <= nowMs) return 'past'
  if (Date.parse(r.check_in) > nowMs) return 'upcoming'
  return 'current'
}

// Same rule as the backend (_status): cleaning > occupied > reserved > available.
// Only used in demo mode; with the real API the server sends `status`.
export function computeStatus(apt, reservations, nowMs) {
  if (apt.cleaning) return 'cleaning'
  const active = reservations.filter(
    (r) => r.apartment_id === apt.id && r.status === 'confirmed' && Date.parse(r.check_out) > nowMs,
  )
  if (active.some((r) => Date.parse(r.check_in) <= nowMs)) return 'occupied'
  return active.length ? 'reserved' : 'available'
}

export function nextReservation(aptId, reservations, nowMs) {
  return reservations
    .filter((r) => r.apartment_id === aptId && r.status === 'confirmed' && Date.parse(r.check_in) > nowMs)
    .sort((a, b) => Date.parse(a.check_in) - Date.parse(b.check_in))[0]
}

export function currentReservation(aptId, reservations, nowMs) {
  return reservations.find(
    (r) => r.apartment_id === aptId && r.status === 'confirmed' && reservationTimeState(r, nowMs) === 'current',
  )
}

export const sum = (arr) => arr.reduce((a, b) => a + b, 0)
export const round1 = (n) => Math.round(n * 10) / 10
export const round2 = (n) => Math.round(n * 100) / 100

export const COLORS = ['#3fae82', '#c0394f', '#d9b36a', '#6fb3c8', '#a7a7cf', '#d98fb0']

export function weekLabels(lang = 'en') {
  const t = new Date()
  return Array.from({ length: 7 }, (_, i) =>
    addDays(t, i - 6).toLocaleDateString(locale(lang), { weekday: 'short' }),
  )
}

// ---- journal entries come from the server as raw strings ("door=unlocked", "on=True", …) ----
export function describeAction(action = '', t) {
  const m = action.match(/(door|window|on|target|mode|cleaning)\W+([\w-]+)/)
  if (m) {
    const [, k, vRaw] = m
    const v = vRaw.toLowerCase()
    if (k === 'door') return t(v === 'unlocked' ? 'act.unlockDoor' : 'act.lockDoor')
    if (k === 'window') return t(v === 'open' ? 'act.openWindow' : 'act.closeWindow')
    if (k === 'on') return t(v === 'true' ? 'act.acOn' : 'act.acOff')
    if (k === 'target') return t('act.target', { n: vRaw })
    if (k === 'mode') return t('act.mode', { mode: t(`mode.${v}`) })
    if (k === 'cleaning') return t(v === 'true' ? 'act.cleaningOn' : 'act.cleaningOff')
  }
  if (action.startsWith('access_attempt')) return t('act.keypad')
  if (action.startsWith('create_reservation')) return t('act.resCreate')
  if (action.startsWith('update_reservation')) return t('act.resUpdate')
  if (action.startsWith('delete_reservation')) return t('act.resDelete')
  if (action.startsWith('create_access_code')) return t('act.codeCreate')
  if (action.startsWith('cancel_access_code')) return t('act.codeCancel')
  if (action.startsWith('verify_code')) return t('act.codeVerify')
  const r = action.match(/^rule (\S+) (on|off)/)
  if (r) return t(r[2] === 'on' ? 'act.ruleOn' : 'act.ruleOff', { rule: t(`rule.${r[1]}.name`) })
  return action
}

const DETAIL_KEYS = {
  ok: 'detail.ok',
  'code inconnu': 'detail.unknownCode',
  'mauvais logement': 'detail.wrongHouse',
  'code annulé': 'detail.cancelledCode',
  'hors période de validité': 'detail.outOfPeriod',
  'réservation non valide': 'detail.invalidRes',
  'rôle non autorisé': 'detail.roleDenied',
  chevauchement: 'detail.overlap',
  'MQTT indisponible': 'detail.mqtt',
  'cible hors 16-32': 'detail.badTarget',
  'mode inconnu': 'detail.badMode',
}
export function describeDetail(detail = '', t) {
  return DETAIL_KEYS[detail] ? t(DETAIL_KEYS[detail]) : ''
}
