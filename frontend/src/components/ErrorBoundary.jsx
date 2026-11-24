import { Component } from 'react'

// Safety net: an unexpected error must never leave a blank page (backend answers can be surprising).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error('Dashboard error:', error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="login login-single">
        <div className="login-card glass">
          <h1>SmartStay</h1>
          <p className="muted">Something went wrong while displaying the dashboard. · وقع شي مشكل فـ العرض.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload · عاود التحميل</button>
        </div>
      </div>
    )
  }
}
