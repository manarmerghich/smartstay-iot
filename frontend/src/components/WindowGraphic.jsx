// Moroccan arched window with two motorised sashes. The sashes slide open / closed with the state.
export default function WindowGraphic({ open }) {
  const arch = 'M36 206 V92 a64 64 0 0 1 128 0 V206 z'
  const lattice = (x0, x1) =>
    Array.from({ length: 9 }, (_, i) => {
      const x = x0 + i * ((x1 - x0) / 4)
      return <path key={i} d={`M${x} 30 L${x - 60} 210 M${x - 60} 30 L${x} 210`} />
    })
  return (
    <svg className={`window-graphic ${open ? 'is-open' : ''}`} viewBox="0 0 200 220" role="img" aria-label={open ? 'Window open' : 'Window closed'}>
      <defs>
        <clipPath id="wg-arch"><path d={arch} /></clipPath>
        <linearGradient id="wg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14213a" />
          <stop offset="0.55" stopColor="#7a2a3a" />
          <stop offset="1" stopColor="#d98c4a" />
        </linearGradient>
      </defs>
      {/* outer arch frame (zellige-like double line) */}
      <path d="M28 212 V92 a72 72 0 0 1 144 0 V212 z" fill="none" stroke="#c9a45c" strokeWidth="2" opacity="0.8" />
      <path d={arch} fill="url(#wg-sky)" />
      <g clipPath="url(#wg-arch)">
        {/* night view behind the window: minaret + houses */}
        <g fill="#0b0b0d" opacity="0.85">
          <rect x="120" y="120" width="12" height="90" />
          <rect x="122" y="108" width="8" height="12" />
          <path d="M122 108 q4 -9 8 0z" />
          <rect x="40" y="165" width="34" height="45" />
          <rect x="78" y="150" width="28" height="60" />
          <rect x="136" y="170" width="28" height="40" />
        </g>
        {/* sashes */}
        <g className="sash" style={{ transformOrigin: '36px 110px', transform: open ? 'scaleX(0.16)' : 'scaleX(1)' }}>
          <rect x="36" y="20" width="64" height="190" fill="rgba(20,16,16,0.82)" stroke="#c9a45c" strokeWidth="1.5" />
          <g stroke="#c9a45c" strokeWidth="0.8" opacity="0.55" clipPath="url(#wg-arch)">{lattice(36, 100)}</g>
        </g>
        <g className="sash" style={{ transformOrigin: '164px 110px', transform: open ? 'scaleX(0.16)' : 'scaleX(1)' }}>
          <rect x="100" y="20" width="64" height="190" fill="rgba(20,16,16,0.82)" stroke="#c9a45c" strokeWidth="1.5" />
          <g stroke="#c9a45c" strokeWidth="0.8" opacity="0.55" clipPath="url(#wg-arch)">{lattice(100, 164)}</g>
        </g>
      </g>
      {/* sill + small motor */}
      <rect x="24" y="206" width="152" height="8" rx="3" fill="#2a2023" stroke="#c9a45c" strokeWidth="1" />
      <circle cx="100" cy="14" r="7" fill="#161618" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M96 14h8M100 10v8" stroke="var(--accent)" strokeWidth="1.3" />
    </svg>
  )
}
