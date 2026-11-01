import Icon from './Icons'

export default function SimBadge({ text = 'Simulated data' }) {
  return (
    <span className="sim-badge" title="All measurements are simulated — no real equipment is connected.">
      <Icon name="info" size={13} /> {text}
    </span>
  )
}
