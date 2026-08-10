import { createContext, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BookSidePanel from './BookSidePanel.jsx';

const StackContext = createContext(null);

export function useStack() {
  return useContext(StackContext);
}

export function StackProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const overlays = location.state?.overlays || [];

  function open({ bookId, chapter = 1 }) {
    navigate(location.pathname, {
      state: { ...(location.state || {}), overlays: [...overlays, { bookId, chapter }] }
    });
  }

  function close() {
    if (overlays.length === 0) return;
    navigate(-1);
  }

  return (
    <StackContext.Provider value={{ open, close }}>
      {children}
      {overlays.map((entry, index) => (
        <div key={`${entry.bookId}_${index}`} className="route-overlay">
          <div className="route-overlay-body">
            <BookSidePanel bookId={entry.bookId} onBack={close} openChapter={entry.chapter} />
          </div>
        </div>
      ))}
    </StackContext.Provider>
  );
}
