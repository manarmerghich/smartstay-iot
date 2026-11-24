// Wall air conditioner. In the simulation the A/C is represented by a RED LED (lit = activated).
export default function AcGraphic({ on }) {
  return (
    <svg className={`ac-graphic ${on ? 'is-on' : ''}`} viewBox="0 0 240 140" role="img" aria-label={on ? 'A/C activated' : 'A/C deactivated'}>
      <defs>
        <linearGradient id="ac-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efece6" /><stop offset="1" stopColor="#c9c4bb" />
        </linearGradient>
        <filter id="led-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>
      <rect x="14" y="16" width="212" height="70" rx="16" fill="url(#ac-body)" />
      <rect x="26" y="62" width="150" height="10" rx="5" fill="#8d877d" opacity="0.65" />
      <g stroke="#8d877d" strokeWidth="1.5" opacity="0.6">
        <path d="M30 36h140M30 44h140M30 52h140" />
      </g>
      {/* LED */}
      {on && <circle cx="202" cy="34" r="9" fill="#ff2a3d" filter="url(#led-glow)" />}
      <circle cx="202" cy="34" r="5.5" fill={on ? '#ff3b4d' : '#3a2428'} stroke="#7d747a" strokeWidth="1" />
      {/* air flow */}
      <g className="airflow" fill="none" stroke="#b4d7bf" strokeWidth="2" strokeLinecap="round" opacity={on ? 0.9 : 0}>
        <path d="M50 98c8 8-8 14 0 22" /><path d="M96 98c8 8-8 14 0 22" /><path d="M142 98c8 8-8 14 0 22" />
      </g>
    </svg>
  )
}
