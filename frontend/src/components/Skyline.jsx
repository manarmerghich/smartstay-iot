// Decorative medina skyline (minaret, dome, crenellated wall). Purely ornamental.
const merlons = Array.from({ length: 40 }, (_, i) => `M${i * 10} 84 l5 -9 l5 9`).join(' ')

export default function Skyline({ className = '' }) {
  return (
    <svg className={`skyline ${className}`} viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="currentColor">
        <rect x="0" y="84" width="400" height="16" />
        <path d={merlons} />
        {/* minaret */}
        <rect x="318" y="26" width="24" height="58" />
        <rect x="324" y="14" width="12" height="12" />
        <path d="M325 14 q5 -10 10 0z" />
        <rect x="329" y="0" width="2" height="8" />
        {/* dome */}
        <path d="M110 84 a32 32 0 0 1 64 0z" />
        <rect x="140" y="42" width="4" height="10" />
        <rect x="104" y="72" width="76" height="12" />
        {/* palm trees */}
        {[60, 288, 380].map((x) => (
          <g key={x}>
            <path d={`M${x} 84 q2 -22 -1 -40 l3 0 q2 18 1 40z`} />
            <path d={`M${x + 1} 44 q-14 -4 -20 6 M${x + 1} 44 q14 -4 20 6 M${x + 1} 44 q-8 -12 -16 -10 M${x + 1} 44 q8 -12 16 -10 M${x + 1} 44 q0 -10 0 -14`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </g>
        ))}
        {/* houses */}
        <rect x="196" y="58" width="44" height="26" />
        <rect x="250" y="66" width="34" height="18" />
        <rect x="30" y="62" width="40" height="22" />
        <rect x="76" y="70" width="26" height="14" />
        <rect x="360" y="64" width="32" height="20" />
      </g>
    </svg>
  )
}
