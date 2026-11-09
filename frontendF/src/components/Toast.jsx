import Icon from './Icons'

export default function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type}`} role="status" key={toast.id}>
      <Icon name={toast.type === 'error' ? 'alert' : 'check'} size={18} />
      <span>{toast.message}</span>
    </div>
  )
}
