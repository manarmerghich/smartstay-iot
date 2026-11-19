import { useEffect, useState } from 'react'

// Current time, refreshed every `ms` (default 30 s) — keeps time-dependent UI up to date with pure renders
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
