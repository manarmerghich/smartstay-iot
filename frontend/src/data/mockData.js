import { addDays, toISO } from '../utils/helpers'

const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=70`

export const HERO_IMAGE = IMG('photo-1586023492125-27b2c045efd7')

export const USERS = [
  { id: 'u1', name: 'Owner', role: 'owner', label: 'Owner', avatar: '#8fbf9f' },
  { id: 'u2', name: 'Manager', role: 'manager', label: 'Manager', avatar: '#c9a27e' },
  { id: 'u3', name: 'Cleaning staff', role: 'staff', label: 'Cleaning staff', avatar: '#9a9ab8' },
]

// What each role is allowed to command (also enforced by the API layer / backend)
export const PERMISSIONS = {
  owner: ['door', 'ac', 'window'],
  manager: ['door', 'ac', 'window'],
  staff: ['window'],
}

export const OUTSIDE_TEMP = { 'Fès': 29, Rabat: 24, Tanger: 22 }

// 6 previous days of simulated consumption (kWh); today's value grows in real time
export const initialApartments = [
  {
    id: 'apt-fes', name: 'Riad Atlas Suite', city: 'Fès', address: '12 Rue Talaa Kebira (fictional)',
    image: IMG('photo-1502672260266-1c1ef2d93688'), cleaning: false,
    door: 'locked', window: 'open', ac: { on: true, target: 24, mode: 'cool' },
    temperature: 26.4, humidity: 41, presence: true,
    energyHistory: [9.8, 10.4, 8.9, 11.2, 12.1, 10.7], energyToday: 6.2,
  },
  {
    id: 'apt-rab', name: 'Oudaya Sea Apartment', city: 'Rabat', address: '27 Boulevard Al Marsa (fictional)',
    image: IMG('photo-1522708323590-d24dbb6b0267'), cleaning: true,
    door: 'locked', window: 'closed', ac: { on: false, target: 22, mode: 'cool' },
    temperature: 24.2, humidity: 52, presence: true,
    energyHistory: [7.5, 8.1, 7.7, 9.3, 8.4, 7.9], energyToday: 3.1,
  },
  {
    id: 'apt-tng', name: 'Marina Bay Studio', city: 'Tanger', address: '3 Avenue Mohammed VI (fictional)',
    image: IMG('photo-1493809842364-78817add7ffb'), cleaning: false,
    door: 'locked', window: 'closed', ac: { on: true, target: 22, mode: 'cool' },
    temperature: 22.8, humidity: 58, presence: false,
    energyHistory: [4.2, 4.9, 5.3, 4.6, 5.8, 5.1], energyToday: 2.7,
  },
]

export function buildInitialReservations() {
  const t = new Date()
  const d = (n) => toISO(addDays(t, n))
  return [
    { id: 'r1', apartmentId: 'apt-fes', guest: 'Booking #1021', start: d(-2), end: d(3) },
    { id: 'r3', apartmentId: 'apt-rab', guest: 'Booking #1018', start: d(-6), end: d(-1) },
    { id: 'r4', apartmentId: 'apt-rab', guest: 'Booking #1024', start: d(2), end: d(6) },
    { id: 'r5', apartmentId: 'apt-tng', guest: 'Booking #1027', start: d(4), end: d(9) },
    { id: 'r6', apartmentId: 'apt-fes', guest: 'Booking #1030', start: d(6), end: d(10) },
  ]
}

export const initialRules = [
  {
    id: 'close-window-ac', name: 'Save energy', enabled: true,
    conditions: ['Air conditioner is ON', 'Window is OPEN'],
    action: 'Close the window automatically',
    description: 'Avoids cooling the street: the window closes as soon as the A/C runs with it open.',
  },
  {
    id: 'auto-cool', name: 'Comfort guard', enabled: true, threshold: 28,
    conditions: ['Temperature ≥ 28 °C', 'Presence detected', 'Air conditioner is OFF'],
    action: 'Turn the air conditioner ON at its target temperature',
    description: 'Keeps occupied apartments comfortable during heat peaks.',
  },
]
