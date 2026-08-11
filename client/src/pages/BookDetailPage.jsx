import { useLocation, useNavigate, useParams } from 'react-router-dom';
import BookSidePanel from '../components/BookSidePanel.jsx';

export default function BookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  function goBack() {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/my', { replace: true });
    }
  }
  return (
    <div className="page page-fixed">
      <BookSidePanel bookId={id} onBack={goBack} />
    </div>
  );
}
