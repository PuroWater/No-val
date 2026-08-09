import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';

export default function HomePage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
