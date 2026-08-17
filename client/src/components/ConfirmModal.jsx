export default function ConfirmModal({ open, title, message, confirmText = '删除', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h3>{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button className="primary" onClick={onConfirm}>{confirmText}</button>
          <button onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
