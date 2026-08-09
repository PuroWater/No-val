import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Novel Agent</div>
      <nav>
        <NavLink to="/create">创作</NavLink>
        <NavLink to="/continue">续写</NavLink>
        <NavLink to="/shelf">书架</NavLink>
        <NavLink to="/my">我的</NavLink>
      </nav>
      <div className="sidebar-user">
        <span>{user?.username}</span>
        <button onClick={() => { logout(); navigate('/login'); }}>退出</button>
      </div>
    </aside>
  );
}
