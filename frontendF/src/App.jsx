import { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import { NAV } from './data/nav'
import Header from './components/Header'
import RightPanel from './components/RightPanel'
import Toast from './components/Toast'
import Icon from './components/Icons'
import Dashboard from './pages/Dashboard'
import Apartments from './pages/Apartments'
import Energy from './pages/Energy'
import Reservations from './pages/Reservations'
import Automation from './pages/Automation'
import ActivityLog from './pages/ActivityLog'
import { useSmartStay } from './hooks/useSmartStay'

const SUBTITLES = {
  dashboard: 'All your apartments at a glance',
  apartments: 'Control devices and monitor sensors',
  energy: 'Simulated electricity consumption',
  reservations: 'Bookings that drive apartment status',
  automation: 'Rules that act on your devices',
  logs: 'Traceability of every command',
}

export default function App() {
  const store = useSmartStay()
  const [page, setPage] = useState('dashboard')
  const [selectedId, setSelectedId] = useState('apt-fes')
  const [panelOpen, setPanelOpen] = useState(false)

  const openApartment = (id) => { setSelectedId(id); setPage('apartments') }
  const title = NAV.find((n) => n.id === page)?.label

  return (
    <div className="app">
      <Sidebar page={page} onNavigate={setPage} />
      <main className="main">
        <Header title={title} subtitle={SUBTITLES[page]} user={store.user} users={store.users}
          onUserChange={store.setUserId} onMenu={() => setPanelOpen(true)} />
        {store.apiError && <div className="notice error"><Icon name="alert" size={16} /> {store.apiError}</div>}

        {page === 'dashboard' && <Dashboard apartments={store.apartments} reservations={store.reservations} onOpen={openApartment} />}
        {page === 'apartments' && (
          <Apartments apartments={store.apartments} reservations={store.reservations} selectedId={selectedId}
            onSelect={setSelectedId} user={store.user} command={store.command} busy={store.busy}
            logs={store.logs} setCleaning={store.setCleaning} />
        )}
        {page === 'energy' && <Energy apartments={store.apartments} />}
        {page === 'reservations' && (
          <Reservations apartments={store.apartments} reservations={store.reservations}
            onSave={store.saveReservation} onDelete={store.deleteReservation} notify={store.notify} />
        )}
        {page === 'automation' && <Automation rules={store.rules} onToggle={store.toggleRule} logs={store.logs} apartments={store.apartments} />}
        {page === 'logs' && <ActivityLog logs={store.logs} apartments={store.apartments} />}
      </main>

      <RightPanel rules={store.rules} onToggleRule={store.toggleRule} users={store.users} currentUser={store.user}
        logs={store.logs} apartments={store.apartments} open={panelOpen} onClose={() => setPanelOpen(false)}
        onNavigate={(p) => { setPage(p); setPanelOpen(false) }} />
      <Toast toast={store.toast} />
    </div>
  )
}
