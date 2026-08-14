// 回收站分组（纯展示）：已生成图书与构思两组，恢复/彻底删除通过回调上报。
export default function TrashPanel({ books, drafts, onRestore, onPermanent }) {
  return (
    <>
      <div className="trash-section">
        <h3>图书（已生成）</h3>
        {books.length === 0 && <p className="muted">暂无回收图书</p>}
        {books.map((book) => (
          <div key={book.id} className="trash-item">
            <div>
              <strong>{book.title}</strong>
              <span className="muted">{book.chapterCount} 章</span>
            </div>
            <div>
              <button onClick={() => onRestore(book)}>恢复</button>
              <button className="danger" onClick={() => onPermanent(book)}>彻底删除</button>
            </div>
          </div>
        ))}
      </div>
      <div className="trash-section">
        <h3>构思（未生成）</h3>
        {drafts.length === 0 && <p className="muted">暂无回收构思</p>}
        {drafts.map((book) => (
          <div key={book.id} className="trash-item">
            <div>
              <strong>{book.title}</strong>
              <span className="muted">创作中</span>
            </div>
            <div>
              <button onClick={() => onRestore(book)}>恢复</button>
              <button className="danger" onClick={() => onPermanent(book)}>彻底删除</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
