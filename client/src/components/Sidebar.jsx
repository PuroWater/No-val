import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="top-nav">
      <div className="top-brand">Novel Agent</div>
      <nav className="top-links">
        <NavLink to="/workspace">创作</NavLink>
        <NavLink to="/shelf">书城</NavLink>
        <NavLink to="/my">我的</NavLink>
      </nav>
      <div className="user-menu">
        <button className="user-button" onClick={() => setOpen((value) => !value)}>
          {user?.nickname || user?.username || '账号'}
        </button>
        {open && (
          <div className="user-dropdown">
            <NavLink to="/settings" onClick={() => setOpen(false)}>设置</NavLink>
            <button onClick={handleLogout}>退出</button>
          </div>
        )}
      </div>
    </header>
  );
}
