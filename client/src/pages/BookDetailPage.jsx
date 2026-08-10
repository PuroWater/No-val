import { useParams } from 'react-router-dom';
import BookSidePanel from '../components/BookSidePanel.jsx';

export default function BookDetailPage() {
  const { id } = useParams();
  return (
    <div className="page page-fixed">
      <BookSidePanel bookId={id} />
    </div>
  );
}
