import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import BookSidePanel from '../components/BookSidePanel.jsx';

export default function BookDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="page page-fixed">
      <BookSidePanel bookId={id} onBack={() => navigate('/my')} />
    </div>
  );
}
