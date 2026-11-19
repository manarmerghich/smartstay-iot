import { useCallback, useEffect, useMemo, useState } from 'react'
import { I18nContext } from './context'
import { CITIES_AR, translations } from './translations'

const KEY = 'smartstay-lang'

export default function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(KEY) === 'ary' ? 'ary' : 'en' } catch { return 'en' }
  })

  // Darija is written right-to-left
  useEffect(() => {
    document.documentElement.lang = lang === 'ary' ? 'ar-MA' : 'en'
    document.documentElement.dir = lang === 'ary' ? 'rtl' : 'ltr'
    try { localStorage.setItem(KEY, lang) } catch { /* ignore */ }
  }, [lang])

  const t = useCallback(
    (key, vars) => {
      let s = translations[lang]?.[key] ?? translations.en[key] ?? key
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v)
      return s
    },
    [lang],
  )
  const city = useCallback((c) => (lang === 'ary' ? CITIES_AR[c] || c : c), [lang])
  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'ary' : 'en')), [])

  const value = useMemo(() => ({ lang, t, city, toggle, rtl: lang === 'ary' }), [lang, t, city, toggle])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
