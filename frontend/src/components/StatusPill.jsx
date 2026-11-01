export default function StatusPill({ status, children }) {
  return <span className={`pill pill-${status}`}>{children}</span>
}
