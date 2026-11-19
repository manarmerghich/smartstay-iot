import { addDays, toISO } from '../utils/helpers'

// Photos are local files in public/images (maison1.jpg … maison6.jpg, door.jpg, bg-medina.jpg)
export const DOOR_IMAGE = '/images/door.jpg'

// The application is for the OWNER only (single role).
export const OWNER_EMAIL = 'owner@smartstay.test'

export const OUTSIDE_TEMP = { 'Fès': 29, Rabat: 24, Tanger: 22, Marrakech: 33 }

// Ids = backend ids (maison1 … maison6). Same order/cities as backend seed.py.
// In real mode only name / photo / address come from here; everything else comes from the API.
export const initialApartments = [
  {
    id: 'maison1', name: 'Riad Atlas Suite', city: 'Fès', address: '12 Rue Talaa Kebira (fictional)',
    image: '/images/maison1.jpg', cleaning: false,
    door: 'locked', window: 'open', ac: { on: true, target: 24, mode: 'cool' },
    temperature: 26.4, humidity: 41, presence: true,
    energyHistory: [9.8, 10.4, 8.9, 11.2, 12.1, 10.7], energyToday: 6.2,
  },
  {
    id: 'maison2', name: 'Oudaya Sea Apartment', city: 'Rabat', address: '27 Boulevard Al Marsa (fictional)',
    image: '/images/maison2.jpg', cleaning: true,
    door: 'locked', window: 'closed', ac: { on: false, target: 22, mode: 'cool' },
    temperature: 24.2, humidity: 52, presence: true,
    energyHistory: [7.5, 8.1, 7.7, 9.3, 8.4, 7.9], energyToday: 3.1,
  },
  {
    id: 'maison3', name: 'Marina Bay Studio', city: 'Tanger', address: '3 Avenue Mohammed VI (fictional)',
    image: '/images/maison3.jpg', cleaning: false,
    door: 'locked', window: 'closed', ac: { on: true, target: 22, mode: 'cool' },
    temperature: 22.8, humidity: 58, presence: false,
    energyHistory: [4.2, 4.9, 5.3, 4.6, 5.8, 5.1], energyToday: 2.7,
  },
  {
    id: 'maison4', name: 'Batha Modern Flat', city: 'Fès', address: '8 Rue Batha (fictional)',
    image: '/images/maison4.jpg', cleaning: false,
    door: 'locked', window: 'closed', ac: { on: false, target: 24, mode: 'cool' },
    temperature: 25.3, humidity: 44, presence: false,
    energyHistory: [5.2, 4.8, 5.9, 6.4, 5.5, 5.0], energyToday: 1.9,
  },
  {
    id: 'maison5', name: 'Kasbah Terrace Loft', city: 'Tanger', address: '19 Rue de la Kasbah (fictional)',
    image: '/images/maison5.jpg', cleaning: false,
    door: 'locked', window: 'closed', ac: { on: true, target: 23, mode: 'cool' },
    temperature: 23.4, humidity: 61, presence: true,
    energyHistory: [6.3, 6.9, 7.4, 6.1, 7.0, 6.6], energyToday: 3.4,
  },
  {
    id: 'maison6', name: 'Majorelle Garden Suite', city: 'Marrakech', address: '14 Rue Yves Saint Laurent (fictional)',
    image: '/images/maison6.jpg', cleaning: true,
    door: 'locked', window: 'closed', ac: { on: false, target: 24, mode: 'cool' },
    temperature: 29.8, humidity: 33, presence: true,
    energyHistory: [11.4, 12.8, 13.5, 12.2, 14.1, 13.0], energyToday: 5.6,
  },
]

// Same shape as the backend: { id, apartment_id, reference, check_in, check_out, status }
export function buildInitialReservations() {
  const now = new Date()
  const dt = (n, h) => `${toISO(addDays(now, n))}T${h}:00+01:00`
  const r = (id, apartment_id, ref, a, b) => ({
    id, apartment_id, reference: `Booking #${ref}`, check_in: dt(a, '15:00'), check_out: dt(b, '11:00'), status: 'confirmed',
  })
  return [
    r(1, 'maison1', 1021, -2, 3), r(2, 'maison2', 1018, -6, -1), r(3, 'maison2', 1024, 2, 6),
    r(4, 'maison3', 1027, 4, 9), r(5, 'maison1', 1030, 6, 10), r(6, 'maison5', 1033, -3, 1),
    r(7, 'maison4', 1036, 1, 4), r(8, 'maison6', 1012, -5, -1), r(9, 'maison6', 1039, 3, 8),
  ]
}

// Same shape as GET /rules. Server defaults: comfort-guard ON, save-energy OFF (team decision).
export const initialRules = [
  { id: 'comfort-guard', name: 'Comfort guard', enabled: true, triggers: 0, last_trigger: null, threshold: 28 },
  { id: 'save-energy', name: 'Save energy', enabled: false, triggers: 0, last_trigger: null },
]

// Text of the IF / THEN blocks (translation keys) — the server only sends name + description.
export const RULE_INFO = {
  'comfort-guard': { conditions: ['cond.hot', 'cond.presence', 'cond.acOff'], action: 'act.rule.acOn' },
  'save-energy': { conditions: ['cond.acOn', 'cond.windowOpen'], action: 'act.rule.closeWindow' },
}
