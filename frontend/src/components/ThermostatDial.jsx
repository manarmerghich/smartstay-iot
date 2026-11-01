import Icon from './Icons'

const MIN = 16
const MAX = 32
const R = 82
const C = 110

const polar = (deg) => {
  const rad = ((deg - 90) * Math.PI) / 180
  return [C + R * Math.cos(rad), C + R * Math.sin(rad)]
}
const arc = (a0, a1) => {
  const [x0, y0] = polar(a0)
  const [x1, y1] = polar(a1)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

export default function ThermostatDial({ target, current, on, onChange, disabled }) {
  const start = 225 // bottom-left
  const sweep = 270
  const frac = (target - MIN) / (MAX - MIN)
  const end = start + sweep * frac
  const [kx, ky] = polar(end)

  return (
    <div className={`dial ${on ? '' : 'dial-off'}`}>
      <svg viewBox="0 0 220 220" role="img" aria-label={`Target temperature ${target} degrees`}>
        <path d={arc(start, start + sweep)} className="dial-track" />
        {on && frac > 0 && <path d={arc(start, end)} className="dial-value" />}
        <circle cx={kx} cy={ky} r="8" className="dial-knob" />
        <text x="110" y="112" textAnchor="middle" className="dial-temp">{target}°</text>
        <text x="110" y="136" textAnchor="middle" className="dial-sub">Target · now {current}°C</text>
        <text x="48" y="204" textAnchor="middle" className="dial-limit">{MIN}°C</text>
        <text x="172" y="204" textAnchor="middle" className="dial-limit">{MAX}°C</text>
      </svg>
      <div className="dial-buttons">
        <button className="round-btn" disabled={disabled || !on || target <= MIN} onClick={() => onChange(target - 1)} aria-label="Decrease target temperature">
          <Icon name="minus" />
        </button>
        <button className="round-btn" disabled={disabled || !on || target >= MAX} onClick={() => onChange(target + 1)} aria-label="Increase target temperature">
          <Icon name="plus" />
        </button>
      </div>
    </div>
  )
}
