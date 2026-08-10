import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import SettingsApplier from '../components/SettingsApplier.jsx';
import { StackProvider } from '../components/OverlayStack.jsx';

export default function HomePage() {
  return (
    <StackProvider>
      <div className="app-shell">
        <SettingsApplier />
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </StackProvider>
  );
}
