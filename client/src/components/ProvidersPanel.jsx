// 模型服务管理（0.9.6）：列表 / 新增 / 编辑 / 删除 / 设当前 / 测试连接。
// 前端只需配置 供应商(preset) + 模型(model)（+ baseUrl/Key），思考风格与能力由后端按预设+模型自动推导。
import { useEffect, useState } from 'react';
import { api } from '../api.js';

function emptyForm() {
  return { preset: 'deepseek', name: '', baseUrl: '', apiKey: '', model: '' };
}

export default function ProvidersPanel({ onThinkingSupportChange, onThinkingMandatoryChange }) {
  const [providers, setProviders] = useState([]);
  const [active, setActive] = useState('');
  const [presets, setPresets] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [testingId, setTestingId] = useState('');
  const [testResult, setTestResult] = useState('');

  async function load() {
    const data = await api('/providers');
    setProviders(data.providers || []);
    setActive(data.active || '');
    setPresets(data.presets || {});
    onThinkingSupportChange?.(data.activeProvider?.capabilities?.supportsThinking !== false);
    onThinkingMandatoryChange?.(data.activeProvider?.capabilities?.thinkingMandatory === true);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function applyPreset(presetKey) {
    const preset = presets[presetKey] || {};
    setForm((prev) => ({ ...prev, preset: presetKey, name: preset.name || '', baseUrl: preset.baseUrl || '', model: preset.defaultModel || '' }));
  }

  function startAdd() {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setTestResult('');
  }

  function startEdit(record) {
    setEditingId(record.id);
    setForm({ preset: 'custom', name: record.name || '', baseUrl: record.baseUrl || '', apiKey: '', model: record.model || '' });
    setError('');
    setTestResult('');
  }

  async function submit() {
    setError('');
    setTestResult('');
    try {
      const body = {
        preset: form.preset,
        name: form.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        ...(editingId ? {} : { activate: true })
      };
      if (editingId) {
        await api('/providers/' + editingId, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/providers', { method: 'POST', body: JSON.stringify(body) });
      }
      await load();
      setEditingId(null);
      setForm(emptyForm());
    } catch (err) {
      setError(err.message);
    }
  }

  async function activate(id) {
    try {
      await api('/providers/' + id + '/activate', { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    if (!window.confirm('删除该模型服务？删除后需重新填写才能恢复。')) return;
    try {
      await api('/providers/' + id, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function test(id) {
    setTestingId(id);
    setTestResult('');
    try {
      const data = await api('/providers/' + id + '/test', { method: 'POST' });
      setTestResult('连接成功：' + data.model + ' 回复「' + (data.reply || '') + '」');
    } catch (err) {
      setTestResult('连接失败：' + err.message);
    } finally {
      setTestingId('');
    }
  }

  const currentPreset = presets[form.preset] || {};
  const hasModels = Array.isArray(currentPreset.models) && currentPreset.models.length > 0;

  return (
    <div>
      <div className="settings-group">
        <span>模型服务</span>
        <p className="muted">在此设置使用的模型，目前支持 OpenAI 兼容协议。</p>
        {providers.map((record) => (
          <div className="provider-row" key={record.id}>
            <div className="provider-info">
              <div className="provider-name-line">
                <strong>{record.name}</strong>
                {record.id === active && <span className="provider-active">当前</span>}
              </div>
              <span className="provider-meta">{record.model} · {record.baseUrl}</span>
              <span className="provider-meta">{record.capabilities?.thinkingMandatory ? '强制思考' : (record.capabilities?.supportsThinking ? '支持思考' : '不支持思考')}{record.hasApiKey ? '' : ' · 未填 Key'}</span>
            </div>
            <div className="provider-actions">
              {record.id !== active && (
                <button className="secondary" onClick={() => activate(record.id)}>设为当前</button>
              )}
              <button className="secondary" onClick={() => test(record.id)} disabled={testingId === record.id}>
                {testingId === record.id ? '测试中…' : '测试连接'}
              </button>
              <button className="secondary" onClick={() => startEdit(record)}>编辑</button>
              <button className="danger" onClick={() => remove(record.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      <div className="settings-group provider-form">
        <span>{editingId ? '编辑模型服务' : '新增模型服务'}</span>
        <div className="form-grid">
          <label>供应商
            <select
              value={form.preset}
              onChange={(e) => applyPreset(e.target.value)}
            >
              {Object.keys(presets).map((key) => <option key={key} value={key}>{(presets[key] || {}).name || key}</option>)}
            </select>
          </label>
          <label>名称
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="模型服务名称" />
          </label>
          <label>接口地址（baseUrl）
            <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.deepseek.com" />
          </label>
          <label>模型
            {hasModels ? (
              <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
                {currentPreset.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            ) : (
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="模型名称（如 qwen2.5）" />
            )}
          </label>
          <label>API Key{editingId ? '（留空不修改）' : ''}
            <input value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={editingId ? '已设置，留空不修改' : 'sk-…'} type="password" />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        {testResult && <p className="muted">{testResult}</p>}
        <div className="option-row">
          <button className="primary" onClick={submit}>{editingId ? '保存修改' : '新增并设为当前'}</button>
          {editingId && <button className="secondary" onClick={startAdd}>取消</button>}
        </div>
      </div>
    </div>
  );
}
