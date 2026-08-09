import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import LoginPage from './pages/LoginPage.jsx';
import HomePage from './pages/HomePage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import MyPage from './pages/MyPage.jsx';
import ShelfPage from './pages/ShelfPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import BookDetailPage from './pages/BookDetailPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<HomePage />}>
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/create" element={<Navigate to="/workspace" replace />} />
          <Route path="/continue" element={<Navigate to="/workspace" replace />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/books/:id" element={<BookDetailPage />} />
          <Route path="/shelf" element={<ShelfPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
