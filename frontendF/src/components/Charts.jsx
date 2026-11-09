const W = 600
const H = 220
const PAD = { l: 38, r: 14, t: 14, b: 28 }

export function LineChart({ labels, series, unit = 'kWh' }) {
  const all = series.flatMap((s) => s.values)
  const max = Math.max(1, Math.ceil(Math.max(...all) / 2) * 2)
  const x = (i) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, labels.length - 1)
  const y = (v) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f * 10) / 10)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Consumption chart in ${unit}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="axis">{t}</text>
        </g>
      ))}
      {labels.map((l, i) => (
        <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" className="axis">{l}</text>
      ))}
      {series.map((s) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
        return (
          <g key={s.label}>
            {s.area && (
              <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={s.color} opacity="0.12" />
            )}
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === s.values.length - 1 ? 4.5 : 2.6} fill={s.color}>
                <title>{`${s.label} — ${labels[i]}: ${v} ${unit}`}</title>
              </circle>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

export function BarList({ items, unit = 'kWh' }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <ul className="bar-list">
      {items.map((it) => (
        <li key={it.label}>
          <div className="bar-head">
            <span>{it.label}</span>
            <strong>{it.value} {unit}</strong>
          </div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(it.value / max) * 100}%`, background: it.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Sparkline({ values, color = 'var(--accent)' }) {
  const w = 160, h = 44
  const max = Math.max(...values), min = Math.min(...values)
  const pts = values
    .map((v, i) => `${(i * w) / (values.length - 1)},${h - 4 - ((v - min) / (max - min || 1)) * (h - 8)}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sparkline" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
