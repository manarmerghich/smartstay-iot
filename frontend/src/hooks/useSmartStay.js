import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  OUTSIDE_TEMP, USERS, buildInitialReservations, initialApartments, initialRules,
} from '../data/mockData'
import { fetchApartments, sendCommand, USE_MOCK } from '../services/api'
import { round1, round2 } from '../utils/helpers'

const initialState = {
  apartments: initialApartments,
  reservations: buildInitialReservations(),
  rules: initialRules,
  logs: [],
  nextLogId: 1,
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

function pushLog(state, entry) {
  return {
    ...state,
    logs: [{ id: state.nextLogId, ...entry }, ...state.logs].slice(0, 200),
    nextLogId: state.nextLogId + 1,
  }
}

// Automation engine: evaluates every enabled rule on every apartment.
function applyRules(state, now) {
  let next = state
  const apartments = state.apartments.map((a) => {
    let apt = a
    for (const rule of state.rules) {
      if (!rule.enabled) continue
      if (rule.id === 'close-window-ac' && apt.ac.on && apt.window === 'open') {
        apt = { ...apt, window: 'closed' }
        next = pushLog(next, {
          time: now, user: 'Automation', role: 'system', apartmentId: a.id,
          command: `Rule "${rule.name}" → window closed`, result: 'success', source: 'automation', ruleId: rule.id,
        })
      }
      if (rule.id === 'auto-cool' && apt.temperature >= rule.threshold && apt.presence && !apt.ac.on) {
        apt = { ...apt, ac: { ...apt.ac, on: true } }
        next = pushLog(next, {
          time: now, user: 'Automation', role: 'system', apartmentId: a.id,
          command: `Rule "${rule.name}" → A/C turned on (${apt.ac.target}°C)`, result: 'success', source: 'automation', ruleId: rule.id,
        })
      }
    }
    return apt
  })
  return { ...next, apartments }
}

function reducer(state, action) {
  switch (action.type) {
    // Real backend: merge latest server data (telemetry + device states) into the 6 houses
    case 'hydrate':
      return {
        ...state,
        apartments: state.apartments.map((a) => {
          const srv = action.apartments.find((x) => x.house === a.house)
          if (!srv) return a
          const defined = Object.fromEntries(Object.entries(srv).filter(([k, v]) => v !== undefined && k !== 'ac' && k !== 'house'))
          return { ...a, ...defined, ac: { ...a.ac, ...(srv.ac ?? {}) } }
        }),
      }

    case 'device': {
      const { apartmentId, device, value, user, now, text } = action
      const apartments = state.apartments.map((a) => {
        if (a.id !== apartmentId) return a
        if (device === 'door') return { ...a, door: value }
        if (device === 'window') return { ...a, window: value }
        return { ...a, ac: { ...a.ac, ...value } }
      })
      const withLog = pushLog({ ...state, apartments }, {
        time: now, user: user.name, role: user.role, apartmentId,
        command: text, result: 'success', source: action.source ?? 'user',
      })
      return USE_MOCK ? applyRules(withLog, now) : withLog
    }

    case 'rejected':
      return pushLog(state, {
        time: action.now, user: action.user.name, role: action.user.role, apartmentId: action.apartmentId,
        command: action.text, result: 'rejected', source: 'user',
      })

    // Simulated IoT measurements arriving from the "backend"
    case 'tick': {
      const apartments = state.apartments.map((a, i) => {
        const n = action.noise[i % action.noise.length]
        const outside = OUTSIDE_TEMP[a.city] ?? 26
        const target = a.ac.on ? a.ac.target : outside
        let t = a.temperature + (target - a.temperature) * 0.06 + n * 0.12
        if (a.window === 'open') t += (outside - t) * 0.04
        return {
          ...a,
          temperature: round1(clamp(t, 14, 38)),
          humidity: Math.round(clamp(a.humidity + n * 0.8, 30, 75)),
          energyToday: round2(a.energyToday + (a.ac.on ? 0.03 : 0.005) + (a.window === 'open' && a.ac.on ? 0.01 : 0)),
          lastUpdate: action.now,
        }
      })
      return applyRules({ ...state, apartments }, action.now)
    }

    case 'toggleRule':
      return { ...state, rules: state.rules.map((r) => (r.id === action.id ? { ...r, enabled: !r.enabled } : r)) }

    case 'setCleaning':
      return {
        ...state,
        apartments: state.apartments.map((a) => (a.id === action.id ? { ...a, cleaning: action.value } : a)),
      }

    case 'saveReservation': {
      const r = action.reservation
      const exists = state.reservations.some((x) => x.id === r.id)
      return {
        ...state,
        reservations: exists
          ? state.reservations.map((x) => (x.id === r.id ? r : x))
          : [...state.reservations, r],
      }
    }

    case 'deleteReservation':
      return { ...state, reservations: state.reservations.filter((r) => r.id !== action.id) }

    default:
      return state
  }
}

const describe = (device, value) => {
  if (device === 'door') return value === 'locked' ? 'Lock door' : 'Unlock door'
  if (device === 'window') return value === 'open' ? 'Open window' : 'Close window'
  if ('on' in value) return value.on ? 'Turn A/C on' : 'Turn A/C off'
  if ('target' in value) return `Set A/C target to ${value.target}°C`
  return `Set A/C mode to ${value.mode}`
}

export function useSmartStay() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [userId, setUserId] = useState(USERS[0].id)
  const [toast, setToast] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  const user = USERS.find((u) => u.id === userId)

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  // Real backend: poll the server every 3 s. On failure show a clear message (NFR "Reliability").
  useEffect(() => {
    if (USE_MOCK) return
    const load = () =>
      fetchApartments()
        .then((apartments) => { dispatch({ type: 'hydrate', apartments }); setApiError(null) })
        .catch(() => setApiError('The API is currently unavailable. Showing last known data.'))
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [])

  // Demo mode only: simulated sensor stream (with a real backend the server sends telemetry)
  useEffect(() => {
    if (!USE_MOCK) return
    const id = setInterval(() => {
      dispatch({ type: 'tick', now: Date.now(), noise: Array.from({ length: 8 }, () => Math.random() - 0.5) })
    }, 3000)
    return () => clearInterval(id)
  }, [])

  const command = useCallback(
    async (apartmentId, device, value) => {
      const text = describe(device, value)
      setBusy(true)
      const house = state.apartments.find((a) => a.id === apartmentId)?.house
      const res = await sendCommand({ apartmentId, house, device, value, user })
      setBusy(false)
      if (res.ok) {
        dispatch({ type: 'device', apartmentId, device, value, user, now: Date.now(), text })
        notify(`${text} — done`)
        // The simulated house closes its door by itself ~5 s after an opening (contract).
        if (USE_MOCK && device === 'door' && value === 'unlocked') {
          setTimeout(() => {
            dispatch({
              type: 'device', apartmentId, device: 'door', value: 'locked', now: Date.now(),
              user: { name: 'Simulation', role: 'system' }, text: 'Door closed automatically (after 5 s)', source: 'automation',
            })
          }, 5000)
        }
      } else {
        dispatch({ type: 'rejected', apartmentId, user, now: Date.now(), text })
        notify(res.error, 'error')
      }
      return res
    },
    [user, notify, state.apartments],
  )

  return {
    ...state,
    user, users: USERS, setUserId, command, toast, apiError, busy, notify,
    toggleRule: (id) => dispatch({ type: 'toggleRule', id }),
    setCleaning: (id, value) => dispatch({ type: 'setCleaning', id, value }),
    saveReservation: (reservation) => dispatch({ type: 'saveReservation', reservation }),
    deleteReservation: (id) => dispatch({ type: 'deleteReservation', id }),
  }
}
