// 账户设置分组（自包含）：昵称修改 + 修改密码表单，校验与提交逻辑内部化。
import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';

export default function AccountPanel() {
  const { user, updateNickname } = useAuth();
  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [nicknameMessage, setNicknameMessage] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function changeNickname(event) {
    event.preventDefault();
    setNicknameMessage('');
    setNicknameError('');
    const value = nickname.trim();
    if (!value) {
      setNicknameError('昵称不能为空');
      return;
    }
    try {
      await updateNickname(value);
      setNickname(value);
      setNicknameMessage('昵称已修改');
    } catch (err) {
      setNicknameError(err.message);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ oldPassword, newPassword })
      });
      setMessage('密码已修改');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="settings-group">
        <span>昵称</span>
        <form className="account-form" onSubmit={changeNickname}>
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="昵称（将显示为作者名）" />
          {nicknameError && <p className="form-error">{nicknameError}</p>}
          {nicknameMessage && <p className="saved-tip">{nicknameMessage}</p>}
          <button className="primary" type="submit">保存昵称</button>
        </form>
      </div>
      <div className="settings-group">
        <span>账户设置</span>
        <form className="account-form" onSubmit={changePassword}>
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="原密码" />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新密码（至少 6 位）" />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="确认新密码" />
          {error && <p className="form-error">{error}</p>}
          {message && <p className="saved-tip">{message}</p>}
          <button className="primary" type="submit">修改密码</button>
        </form>
      </div>
    </>
  );
}
