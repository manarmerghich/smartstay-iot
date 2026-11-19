import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  OUTSIDE_TEMP, buildInitialReservations, initialApartments, initialRules,
} from '../data/mockData'
import * as api from '../services/api'
import { USE_MOCK } from '../services/api'
import { useI18n } from '../i18n/useI18n'
import { addDays, computeStatus, describeAction, round1, round2, sum, toISO } from '../utils/helpers'

const makeInitialState = () => {
  const reservations = buildInitialReservations()
  const now = Date.now()
  return {
    apartments: initialApartments.map((a) => ({ ...a, status: computeStatus(a, reservations, now), tempHistory: [a.temperature], lastUpdate: now })),
    reservations,
    rules: initialRules,
    energy: null,
    logs: [],
    nextLogId: 1,
    nextResId: 100,
  }
}

// Demo mode: same shape as GET /energy
function buildEnergy(apartments) {
  const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(new Date(), i - 6)))
  const items = apartments.map((a) => ({
    apartment_id: a.id, today: round2(a.energyToday), history: a.energyHistory, days,
    week_total: round2(sum(a.energyHistory) + a.energyToday), simulated: true,
  }))
  return {
    apartments: items, today_total: round2(sum(items.map((i) => i.today))),
    week_total: round2(sum(items.map((i) => i.week_total))), unit: 'kWh', simulated: true,
  }
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const withStatus = (state, now) => ({
  ...state,
  apartments: state.apartments.map((a) => ({ ...a, status: computeStatus(a, state.reservations, now) })),
})

// Log entry = same shape as GET /logs
function pushLog(state, e) {
  return {
    ...state,
    logs: [{ id: state.nextLogId, rule: null, actor_name: null, actor_role: null, detail: '', ...e }, ...state.logs].slice(0, 200),
    nextLogId: state.nextLogId + 1,
  }
}

// Demo mode only: the real automation runs on the server.
function applyRules(state, now) {
  let next = state
  const apartments = state.apartments.map((a) => {
    let apt = a
    const enabled = (id) => next.rules.find((r) => r.id === id)?.enabled
    const fire = (ruleId, action) => {
      next = pushLog(next, { ts: now, apartment_id: a.id, actor_type: 'automation', rule: ruleId, action, result: 'accepted' })
      next = {
        ...next,
        rules: next.rules.map((r) => (r.id === ruleId ? { ...r, triggers: r.triggers + 1, last_trigger: { ts: now, apartment_id: a.id } } : r)),
      }
    }
    const comfort = state.rules.find((r) => r.id === 'comfort-guard')
    if (enabled('comfort-guard') && apt.temperature >= (comfort?.threshold ?? 28) && apt.presence && !apt.ac.on) {
      apt = { ...apt, ac: { ...apt.ac, on: true } }
      fire('comfort-guard', 'on=True')
    }
    if (enabled('save-energy') && apt.ac.on && apt.window === 'open') {
      apt = { ...apt, window: 'closed' }
      fire('save-energy', 'window=closed')
    }
    return apt
  })
  return { ...next, apartments }
}

function reducer(state, action) {
  switch (action.type) {
    // ---- real mode: replace data coming from the server ----
    case 'setApartments': return { ...state, apartments: action.list }
    case 'setRules': return { ...state, rules: action.list }
    case 'setLogs': return { ...state, logs: action.list }
    case 'setReservations': return { ...state, reservations: action.list }
    case 'setEnergy': return { ...state, energy: action.data }
    case 'applyDevices':
      return {
        ...state,
        apartments: state.apartments.map((a) => (a.id === action.apartmentId ? { ...a, ...action.devices } : a)),
      }
    case 'reset': return makeInitialState()

    // ---- demo mode ----
    case 'device': {
      const { apartmentId, device, value, user, now, raw, source } = action
      const apartments = state.apartments.map((a) => {
        if (a.id !== apartmentId) return a
        if (device === 'door') return { ...a, door: value }
        if (device === 'window') return { ...a, window: value }
        return { ...a, ac: { ...a.ac, ...value } }
      })
      const logged = pushLog({ ...state, apartments }, {
        ts: now, apartment_id: apartmentId, actor_type: source === 'system' ? 'automation' : 'user',
        actor_role: user.role, actor_name: user.role, action: raw, result: 'accepted',
      })
      return applyRules(logged, now)
    }
    case 'keypad': {
      const apartments = action.open
        ? state.apartments.map((a) => (a.id === action.apartmentId ? { ...a, door: 'unlocked' } : a))
        : state.apartments
      return pushLog({ ...state, apartments }, {
        ts: action.now, apartment_id: action.apartmentId, actor_type: 'keypad', action: 'access_attempt',
        result: action.open ? 'accepted' : 'refused', detail: action.detail,
      })
    }
    case 'refused':
      return pushLog(state, {
        ts: action.now, apartment_id: action.apartmentId, actor_type: 'user', actor_role: action.user.role,
        actor_name: action.user.role, action: action.raw, result: 'refused', detail: 'rôle non autorisé',
      })
    case 'tick': {
      const apartments = state.apartments.map((a, i) => {
        const n = action.noise[i % action.noise.length]
        const outside = OUTSIDE_TEMP[a.city] ?? 26
        const target = a.ac.on ? a.ac.target : outside
        let tmp = a.temperature + (target - a.temperature) * 0.06 + n * 0.12
        if (a.window === 'open') tmp += (outside - tmp) * 0.04
        const temperature = round1(clamp(tmp, 14, 38))
        return {
          ...a,
          temperature,
          tempHistory: [...(a.tempHistory || []), temperature].slice(-40),
          humidity: Math.round(clamp(a.humidity + n * 0.8, 30, 75)),
          energyToday: round2(a.energyToday + (a.ac.on ? 0.03 : 0.005) + (a.window === 'open' && a.ac.on ? 0.01 : 0)),
          lastUpdate: action.now,
        }
      })
      return withStatus(applyRules({ ...state, apartments }, action.now), action.now)
    }
    case 'toggleRule':
      return { ...state, rules: state.rules.map((r) => (r.id === action.id ? { ...r, enabled: !r.enabled } : r)) }
    case 'setCleaning': {
      const s = {
        ...state,
        apartments: state.apartments.map((a) => (a.id === action.id ? { ...a, cleaning: action.value } : a)),
      }
      return withStatus(pushLog(s, {
        ts: action.now, apartment_id: action.id, actor_type: 'user', actor_role: action.user.role,
        actor_name: action.user.role, action: `cleaning=${action.value ? 'True' : 'False'}`, result: 'accepted',
      }), action.now)
    }
    case 'saveReservation': {
      const r = action.reservation
      const exists = state.reservations.some((x) => x.id === r.id)
      const reservations = exists ? state.reservations.map((x) => (x.id === r.id ? r : x)) : [...state.reservations, r]
      return withStatus(
        pushLog({ ...state, reservations, nextResId: state.nextResId + (exists ? 0 : 1) }, {
          ts: action.now, apartment_id: r.apartment_id, actor_type: 'user', actor_role: action.user.role,
          actor_name: action.user.role, action: `${exists ? 'update' : 'create'}_reservation #${r.id}`, result: 'accepted',
        }),
        action.now,
      )
    }
    case 'cancelReservation': {
      const reservations = state.reservations.map((x) => (x.id === action.id ? { ...x, status: 'cancelled' } : x))
      const r = state.reservations.find((x) => x.id === action.id)
      return withStatus(
        pushLog({ ...state, reservations }, {
          ts: action.now, apartment_id: r?.apartment_id, actor_type: 'user', actor_role: action.user.role,
          actor_name: action.user.role, action: `delete_reservation #${action.id}`, result: 'accepted',
        }),
        action.now,
      )
    }
    default: return state
  }
}

const rawAction = (device, value) => {
  if (device === 'door') return `door=${value}`
  if (device === 'window') return `window=${value}`
  const [k, v] = Object.entries(value)[0]
  return `${k}=${k === 'on' ? (v ? 'True' : 'False') : v}`
}

const overlaps = (list, apartment_id, ci, co, ignoreId) =>
  list.some((r) =>
    r.apartment_id === apartment_id && r.status !== 'cancelled' && r.id !== ignoreId &&
    Date.parse(r.check_in) < Date.parse(co) && Date.parse(r.check_out) > Date.parse(ci))

export function useSmartStay() {
  const { t } = useI18n()
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState)
  const [session, setSession] = useState(() => api.getSession())
  const [toast, setToast] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  const mockCodes = useRef([])
  const role = session?.role
  const user = useMemo(() => (role ? { role } : null), [role])

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 3500)
  }, [])

  const errorText = useCallback((status, detail) => {
    if (status === 0) return t('err.api')
    if (status === 403) return t('err.forbidden')
    // 409: the server sends a readable message (French) — shown as is
    if (status === 409) return typeof detail === 'string' && detail ? detail : t('err.overlap')
    if (status === 422) return t('err.invalid')
    if (status === 503) return t('err.mqtt')
    if (status === 404) return t('err.notFound')
    return typeof detail === 'string' && detail ? detail : t('err.server', { n: status ?? '' })
  }, [t])

  // ---------------- authentication ----------------
  useEffect(() => { api.setOnUnauthorized(() => setSession(null)) }, [])

  const signIn = useCallback(async (email, password) => {
    try {
      const s = await api.login(email, password)
      // this application is for the owner only
      if (s.role !== 'owner') { api.logout(); throw Object.assign(new Error('owner-only'), { status: -1 }) }
      setSession(s)
    } catch (e) {
      if (e.status === -1 || e.status === 403) throw new Error(t('login.ownerOnly'), { cause: e })
      throw new Error(e.status === 401 ? t('login.wrong') : e.status === 0 ? t('err.api') : t('login.failed', { n: e.status }), { cause: e })
    }
  }, [t])
  const signInDemo = useCallback(() => setSession({ token: 'demo', role: 'owner', name: 'owner' }), [])
  const signOut = useCallback(() => {
    api.logout()
    setSession(null)
    dispatch({ type: 'reset' })
  }, [])

  // ---------------- real mode: poll the server ----------------
  useEffect(() => {
    if (USE_MOCK || !session) return
    let stop = false
    const fast = async () => {
      try {
        const list = await api.fetchApartments()
        if (!stop) { dispatch({ type: 'setApartments', list }); setApiError(null) }
      } catch (e) {
        if (!stop && e.status !== 401) setApiError(t('err.api'))
      }
    }
    const slow = async () => {
      try {
        const [rules, logs, res, energy] = await Promise.all([api.fetchRules(), api.fetchLogs(), api.fetchReservations(), api.fetchEnergy()])
        if (stop) return
        dispatch({ type: 'setRules', list: rules }); dispatch({ type: 'setLogs', list: logs })
        dispatch({ type: 'setReservations', list: res }); dispatch({ type: 'setEnergy', data: energy })
      } catch { /* the fast loop reports connection problems */ }
    }
    fast(); slow()
    // sensors are refreshed every 5 s (same period as the ESP32 telemetry)
    const i1 = setInterval(fast, 5000)
    const i2 = setInterval(slow, 5000)
    return () => { stop = true; clearInterval(i1); clearInterval(i2) }
  }, [session, t])

  const refreshSoon = useCallback(async () => {
    if (USE_MOCK) return
    try {
      dispatch({ type: 'setApartments', list: await api.fetchApartments() })
      dispatch({ type: 'setLogs', list: await api.fetchLogs() })
    } catch { /* ignore */ }
  }, [])

  // ---------------- demo mode: simulated sensor stream ----------------
  useEffect(() => {
    if (!USE_MOCK || !session) return
    const id = setInterval(() => {
      dispatch({ type: 'tick', now: Date.now(), noise: Array.from({ length: 8 }, () => Math.random() - 0.5) })
    }, 5000)
    return () => clearInterval(id)
  }, [session])

  // ---------------- commands ----------------
  const command = useCallback(async (apartmentId, device, value) => {
    const raw = rawAction(device, value)
    const label = describeAction(raw, t)
    setBusy(true)
    const res = await api.sendCommand({ apartmentId, device, value, user })
    setBusy(false)
    if (res.ok) {
      if (USE_MOCK) {
        dispatch({ type: 'device', apartmentId, device, value, user, now: Date.now(), raw })
        // the simulated house re-locks itself ~5 s after an opening (contract)
        if (device === 'door' && value === 'unlocked') {
          setTimeout(() => {
            dispatch({ type: 'device', apartmentId, device: 'door', value: 'locked', user, now: Date.now(), raw: 'door=locked', source: 'system' })
          }, 5000)
        }
      } else {
        dispatch({
          type: 'applyDevices', apartmentId,
          devices: { door: res.devices.door, window: res.devices.window, ac: res.devices.ac },
        })
        refreshSoon()
      }
      notify(t('toast.done', { action: label }))
    } else {
      if (USE_MOCK) dispatch({ type: 'refused', apartmentId, user, now: Date.now(), raw })
      else refreshSoon()
      notify(errorText(res.status, res.detail), 'error')
    }
    return res
  }, [user, t, notify, errorText, refreshSoon])

  const setCleaning = useCallback(async (id, value) => {
    try {
      if (USE_MOCK) dispatch({ type: 'setCleaning', id, value, user, now: Date.now() })
      else { await api.setCleaning(id, value); await refreshSoon() }
      notify(t(value ? 'toast.cleaningOn' : 'toast.cleaningOff'))
    } catch (e) { notify(errorText(e.status, e.detail), 'error') }
  }, [user, t, notify, errorText, refreshSoon])

  const toggleRule = useCallback(async (id) => {
    const rule = state.rules.find((r) => r.id === id)
    try {
      if (USE_MOCK) dispatch({ type: 'toggleRule', id })
      else {
        await api.setRule(id, !rule.enabled)
        dispatch({ type: 'setRules', list: await api.fetchRules() })
      }
    } catch (e) { notify(errorText(e.status, e.detail), 'error') }
  }, [state.rules, notify, errorText])

  // ---------------- reservations (throws Error with .status so the form can show the reason) ----------------
  const saveReservation = useCallback(async (form) => {
    const body = { apartment_id: form.apartment_id, reference: form.reference, check_in: form.check_in, check_out: form.check_out }
    if (USE_MOCK) {
      if (overlaps(state.reservations, body.apartment_id, body.check_in, body.check_out, form.id)) {
        const e = new Error('overlap'); e.status = 409; throw e
      }
      dispatch({
        type: 'saveReservation', user, now: Date.now(),
        reservation: { ...body, id: form.id ?? state.nextResId, status: 'confirmed' },
      })
    } else {
      if (form.id) await api.updateReservation(form.id, body)
      else await api.createReservation(body)
      dispatch({ type: 'setReservations', list: await api.fetchReservations() })
      dispatch({ type: 'setApartments', list: await api.fetchApartments() })
    }
    notify(t(form.id ? 'toast.resUpdated' : 'toast.resCreated'))
  }, [state.reservations, state.nextResId, user, notify, t])

  const cancelReservation = useCallback(async (id) => {
    try {
      if (USE_MOCK) dispatch({ type: 'cancelReservation', id, user, now: Date.now() })
      else {
        await api.deleteReservation(id)
        dispatch({ type: 'setReservations', list: await api.fetchReservations() })
        dispatch({ type: 'setApartments', list: await api.fetchApartments() })
      }
      notify(t('toast.resCancelled'))
    } catch (e) { notify(errorText(e.status, e.detail), 'error') }
  }, [user, notify, t, errorText])

  // ---------------- access codes ----------------
  const codes = {
    list: async (resId) => (USE_MOCK ? mockCodes.current.filter((c) => c.reservation_id === resId) : api.fetchAccessCodes(resId)),
    create: async (resId) => {
      if (!USE_MOCK) return api.createAccessCode(resId)
      const r = state.reservations.find((x) => x.id === resId)
      mockCodes.current = mockCodes.current.map((c) => (c.reservation_id === resId && c.status === 'active' ? { ...c, status: 'cancelled' } : c))
      const c = {
        id: Date.now(), code: String(Math.floor(Math.random() * 1e6)).padStart(6, '0'), reservation_id: resId,
        apartment_id: r.apartment_id, valid_from: r.check_in, valid_until: r.check_out, status: 'active',
      }
      mockCodes.current = [c, ...mockCodes.current]
      return c
    },
    cancel: async (codeId) => {
      if (!USE_MOCK) return api.cancelAccessCode(codeId)
      mockCodes.current = mockCodes.current.map((c) => (c.id === codeId ? { ...c, status: 'cancelled' } : c))
      return mockCodes.current.find((c) => c.id === codeId)
    },
  }

  // Demo mode: virtual 4x4 keypad (the real one is the ESP32 keypad; the server checks the code)
  const keypad = useCallback(async (apartmentId, code) => {
    if (!USE_MOCK) {
      // real mode: manual check with POST /access/verify (the Wokwi keypad itself goes through MQTT)
      try {
        const r = await api.verifyCode(apartmentId, code)
        refreshSoon()
        return { result: r.result, test: true }
      } catch (e) {
        notify(errorText(e.status, e.detail), 'error')
        return { result: 'error' }
      }
    }
    const now = Date.now()
    const c = mockCodes.current.find((x) => x.code === code)
    let result = 'denied'
    let detail = 'code inconnu'
    if (c) {
      if (c.apartment_id !== apartmentId) detail = 'mauvais logement'
      else if (c.status !== 'active') detail = 'code annulé'
      else if (now < Date.parse(c.valid_from) || now >= Date.parse(c.valid_until)) detail = 'hors période de validité'
      else { result = 'open'; detail = 'ok' }
    }
    dispatch({ type: 'keypad', apartmentId, now, open: result === 'open', detail })
    if (result === 'open') {
      setTimeout(() => {
        dispatch({ type: 'device', apartmentId, device: 'door', value: 'locked', user: { role: 'owner' }, now: Date.now(), raw: 'door=locked', source: 'system' })
      }, 5000)
    }
    return { result }
  }, [refreshSoon, notify, errorText])

  const alerts = state.apartments.filter((a) => a.ac.on && a.window === 'open').map((a) => ({ apartment_id: a.id }))
  const energy = useMemo(() => (USE_MOCK || !state.energy ? buildEnergy(state.apartments) : state.energy), [state.energy, state.apartments])

  return {
    ...state, energy, session, role, alerts, keypad,
    signIn, signInDemo, signOut,
    command, setCleaning, toggleRule, saveReservation, cancelReservation, codes, errorText,
    toast, apiError, busy, notify,
  }
}
