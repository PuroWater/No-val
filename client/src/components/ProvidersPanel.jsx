// 模型服务管理（0.9.6 v2）：模型条目列表 + 整页弹窗新增/编辑。
// 前端只做：选厂家 → 自动填默认 URL/模型列表 → 填 Key → 获取模型列表 → 选模型 → 保存。
// 思考参数/能力由后端按厂家预设 + 所选模型自动推导，前端不提供思考开关。
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const REMOTE_FETCH_VENDORS = ['anthropic'];

function emptyForm() {
  return { vendor: 'deepseek', name: '', baseUrl: '', apiKey: '', model: '' };
}

export default function ProvidersPanel() {
  const [entries, setEntries] = useState([]);
  const [active, setActive] = useState('');
  const [presets, setPresets] = useState({});
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', entry }
  const [form, setForm] = useState(emptyForm());
  const [models, setModels] = useState([]); // 当前可选项：预设 + 远端
  const [fetching, setFetching] = useState(false);
  const [formError, setFormError] = useState('');
  const [testingId, setTestingId] = useState('');
  const [testTip, setTestTip] = useState(null); // 测试结果悬浮提示 { x, y, text }
  const [error, setError] = useState('');
  const tipTimerRef = useRef(null);

  async function load() {
    const data = await api('/providers');
    setEntries(data.entries || []);
    setActive(data.active || '');
    setPresets(data.presets || {});
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
    return () => clearTimeout(tipTimerRef.current);
  }, []);

  function showTestTip(text, x, y) {
    setTestTip({
      left: Math.max(8, Math.min(x + 14, window.innerWidth - 270)),
      top: Math.max(8, Math.min(y + 16, window.innerHeight - 90)),
      text
    });
    clearTimeout(tipTimerRef.current);
    tipTimerRef.current = setTimeout(() => setTestTip(null), 4000);
  }

  function applyVendor(vendorKey) {
    const preset = presets[vendorKey] || {};
    setForm((prev) => ({
      ...prev,
      vendor: vendorKey,
      name: preset.name || '',
      baseUrl: preset.baseUrl || '',
      model: preset.defaultModel || ''
    }));
    setModels((preset.models || []).map((m) => ({ ...m })));
    setFormError('');
  }

  function startAdd() {
    setModal({ mode: 'add' });
    setForm(emptyForm());
    setModels([]);
    setFormError('');
    applyVendor('deepseek');
  }

  function startEdit(entry) {
    const preset = presets[entry.vendor] || {};
    setModal({ mode: 'edit', entry });
    setForm({
      vendor: entry.vendor || 'custom',
      name: entry.name || preset.name || '',
      baseUrl: entry.baseUrl || preset.baseUrl || '',
      apiKey: '',
      model: entry.model || ''
    });
    setModels((preset.models || []).map((m) => ({ ...m })));
    setFormError('');
  }

  function closeModal() {
    setModal(null);
    setFormError('');
  }

  async function fetchModels() {
    setFetching(true);
    setFormError('');
    try {
      const body = (modal?.mode === 'edit' && !form.apiKey)
        ? { id: modal.entry.id, vendor: form.vendor }
        : { vendor: form.vendor, baseUrl: form.baseUrl, apiKey: form.apiKey };
      const data = await api('/providers/fetch-models', { method: 'POST', body: JSON.stringify(body) });
      setModels(data.models || []);
      setForm((prev) => ({ ...prev, model: prev.model || (data.models?.[0]?.id || '') }));
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFetching(false);
    }
  }

  async function submit() {
    setFormError('');
    try {
      const body = {
        vendor: form.vendor,
        name: form.name,
        baseUrl: form.baseUrl,
        model: form.model,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        ...(modal?.mode === 'add' ? { activate: true } : {})
      };
      if (modal?.mode === 'edit') {
        await api('/providers/' + modal.entry.id, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/providers', { method: 'POST', body: JSON.stringify(body) });
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function activate(id) {
    try {
      const data = await api('/providers/' + id + '/activate', { method: 'POST' });
      setActive(data.active || '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(entry) {
    if (!window.confirm(`删除“${entry.name}（${entry.model}）”？删除后需重新填写才能恢复。`)) return;
    try {
      const data = await api('/providers/' + entry.id, { method: 'DELETE' });
      setEntries(data.entries || []);
      setActive(data.active || '');
    } catch (err) {
      setError(err.message);
    }
  }

  async function test(entry, event) {
    setTestingId(entry.id);
    setTestTip(null);
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const x = rect ? rect.left : window.innerWidth / 2;
    const y = rect ? rect.top : window.innerHeight / 2;
    try {
      const data = await api('/providers/' + entry.id + '/test', { method: 'POST' });
      showTestTip('连接成功：' + data.model + ' 回复「' + (data.reply || '') + '」', x, y);
    } catch (err) {
      showTestTip(err.message, x, y);
    } finally {
      setTestingId('');
    }
  }

  const presetModels = (presets[form.vendor]?.models || []).map((m) => ({ ...m }));
  const remoteModels = models.filter((m) => m.fromRemote && !presetModels.some((p) => p.id === m.id));
  const hasAnyModels = models.length > 0 || presetModels.length > 0;
  const noRemoteList = REMOTE_FETCH_VENDORS.includes(form.vendor);

  return (
    <div>
      <div className="settings-group">
        <div className="model-manage-head">
          <span>模型服务</span>
          <button className="primary" onClick={startAdd}>＋ 新增模型</button>
        </div>
        <p className="muted">在此设置使用的模型，支持 OpenAI 兼容协议与 Anthropic Messages 协议。思考参数已由后端按厂家预设自动配置，前端无需管理。</p>
        {error && <p className="form-error">{error}</p>}
        {entries.length === 0 && <p className="muted">还没有模型，点击“新增模型”开始配置。</p>}
        {entries.map((entry) => (
          <div className="provider-row" key={entry.id}>
            <div className="provider-info">
              <div className="provider-name-line">
                <strong>{entry.name}</strong>
                {entry.id === active && <span className="provider-active">当前</span>}
              </div>
              <span className="provider-meta">{entry.model} · {entry.baseUrl}</span>
              <span className="provider-meta">
                {entry.capabilities?.thinkingMandatory ? '强制思考' : (entry.capabilities?.supportsThinking ? '支持思考' : '不支持思考')}
                {entry.hasApiKey ? '' : ' · 未填 Key'}
              </span>
            </div>
            <div className="provider-actions">
              {entry.id !== active && (
                <button className="secondary" onClick={() => activate(entry.id)}>设为当前</button>
              )}
              <button className="secondary" onClick={(e) => test(entry, e)} disabled={testingId === entry.id}>
                {testingId === entry.id ? '测试中…' : '测试连接'}
              </button>
              <button className="secondary" onClick={() => startEdit(entry)}>编辑</button>
              <button className="danger" onClick={() => remove(entry)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="model-modal" onClick={(event) => event.stopPropagation()}>
            <div className="model-modal-head">
              <h3>{modal.mode === 'edit' ? '编辑模型' : '新增模型'}</h3>
              <button className="modal-close" onClick={closeModal} aria-label="关闭">×</button>
            </div>
            <div className="form-grid">
              <label>厂家
                <select
                  value={form.vendor}
                  onChange={(e) => applyVendor(e.target.value)}
                >
                  {Object.keys(presets).map((key) => <option key={key} value={key}>{(presets[key] || {}).name || key}</option>)}
                </select>
              </label>
              <label>名称
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="模型显示名称" />
              </label>
              <label>接口地址（baseUrl）
                <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="https://api.deepseek.com" />
              </label>
              <label>API Key{modal.mode === 'edit' ? '（留空不修改）' : ''}
                <input
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={modal.mode === 'edit' ? '已设置，留空不修改' : 'sk-…'}
                  type="password"
                />
              </label>
            </div>

            {hasAnyModels ? (
              <select
                className="model-modal-select"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              >
                {presetModels.length > 0 && (
                  <optgroup label="推荐">
                    {presetModels.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
                  </optgroup>
                )}
                {remoteModels.length > 0 && (
                  <optgroup label="远端模型">
                    {remoteModels.map((m) => <option key={m.id} value={m.id}>{m.label || m.id}</option>)}
                  </optgroup>
                )}
              </select>
            ) : (
              <input
                className="model-modal-select"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="模型名称（如 qwen2.5）"
              />
            )}

            <div className="model-fetch-row">
              <span className="model-fetch-label">模型列表</span>
              {noRemoteList ? (
                <span className="muted">该厂家无公开模型列表接口，请从上方推荐模型中选择。</span>
              ) : (
                <button className="secondary" onClick={fetchModels} disabled={fetching || !form.baseUrl.trim()}>
                  {fetching ? '获取中…' : '获取模型列表'}
                </button>
              )}
            </div>

            {formError && <p className="form-error">{formError}</p>}
            <div className="modal-actions">
              <button className="primary" onClick={submit} disabled={!form.model.trim()}>
                {modal.mode === 'edit' ? '保存修改' : '新增并设为当前'}
              </button>
              <button className="secondary" onClick={closeModal}>取消</button>
            </div>
          </div>
        </div>
      )}

      {testTip && (
        <div className="chat-date-tooltip" style={{ left: testTip.left, top: testTip.top }}>
          {testTip.text}
        </div>
      )}
    </div>
  );
}
