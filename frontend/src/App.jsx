import { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import RightPanel from './components/RightPanel'
import Toast from './components/Toast'
import Icon from './components/Icons'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Apartments from './pages/Apartments'
import Energy from './pages/Energy'
import Reservations from './pages/Reservations'
import Automation from './pages/Automation'
import ActivityLog from './pages/ActivityLog'
import { NAV } from './data/nav'
import { useSmartStay } from './hooks/useSmartStay'
import { useI18n } from './i18n/useI18n'

export default function App() {
  const { t } = useI18n()
  const store = useSmartStay()
  const [page, setPage] = useState('dashboard')
  const [selectedId, setSelectedId] = useState('maison1')
  const [panelOpen, setPanelOpen] = useState(false)

  if (!store.session) return <Login onSignIn={store.signIn} onDemo={store.signInDemo} />

  const current = NAV.find((n) => n.id === page) ?? NAV[0]
  const openApartment = (id) => { setSelectedId(id); setPage('apartments') }

  return (
    <div className="app">
      <Sidebar page={current.id} onNavigate={setPage} />
      <main className="main">
        <Header title={t(current.key)} subtitle={t(`sub.${current.id}`)}
          onLogout={store.signOut} onMenu={() => setPanelOpen(true)} />
        {store.apiError && <div className="notice error"><Icon name="alert" size={16} /> {store.apiError}</div>}

        {current.id === 'dashboard' && <Dashboard apartments={store.apartments} alerts={store.alerts} energy={store.energy} onOpen={openApartment} />}
        {current.id === 'apartments' && (
          <Apartments apartments={store.apartments} reservations={store.reservations} logs={store.logs}
            selectedId={selectedId} onSelect={setSelectedId}
            command={store.command} busy={store.busy} setCleaning={store.setCleaning} keypad={store.keypad} />
        )}
        {current.id === 'energy' && <Energy apartments={store.apartments} energy={store.energy} />}
        {current.id === 'reservations' && (
          <Reservations apartments={store.apartments} reservations={store.reservations} onSave={store.saveReservation}
            onCancel={store.cancelReservation} codes={store.codes} errorText={store.errorText} />
        )}
        {current.id === 'automation' && <Automation rules={store.rules} onToggle={store.toggleRule} apartments={store.apartments} />}
        {current.id === 'logs' && <ActivityLog logs={store.logs} apartments={store.apartments} />}
      </main>

      <RightPanel rules={store.rules} onToggleRule={store.toggleRule} logs={store.logs}
        apartments={store.apartments} open={panelOpen} onClose={() => setPanelOpen(false)}
        onNavigate={(p) => { setPage(p); setPanelOpen(false) }} />
      <Toast toast={store.toast} />
    </div>
  )
}
