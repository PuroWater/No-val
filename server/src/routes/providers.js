// 模型服务管理接口（0.9.6 v2）：数据存 data/providers.json（全局，模型条目 entries[]）。
// 前端流程：选厂家 → 填 Key → 拉模型列表（fetch-models）→ 选模型 → 新增/编辑；apiKey 脱敏不回传。
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  VENDOR_PRESETS,
  readModelEntries,
  writeModelEntries,
  normalizeModelInput,
  maskEntry
} from '../lib/providersStore.js';
import { getProvider } from '../services/providers/index.js';
import { listRemoteModels } from '../services/modelList.js';

const router = Router();
router.use(requireAuth);

function respond(res, entries, active) {
  const activeEntry = entries.find((item) => item.id === active) || entries[0] || null;
  res.json({
    entries: entries.map(maskEntry),
    active,
    activeEntry: activeEntry ? maskEntry(activeEntry) : null,
    presets: Object.fromEntries(
      Object.entries(VENDOR_PRESETS).map(([key, preset]) => [
        key,
        {
          name: preset.name,
          protocol: preset.protocol,
          baseUrl: preset.baseUrl,
          defaultModel: preset.defaultModel,
          thinkingStyle: preset.thinkingStyle,
          thinkingDefault: preset.thinkingDefault,
          maxOutputTokens: preset.maxOutputTokens,
          models: (preset.models || []).map((item) => ({
            id: item.id,
            label: item.label,
            thinkingMandatory: item.thinkingMandatory === true,
            thinkingDefault: item.thinkingDefault
          }))
        }
      ])
    )
  });
}

function presetModelsFor(vendorKey) {
  return (VENDOR_PRESETS[vendorKey]?.models || []).map((item) => ({ ...item }));
}

router.get('/', (req, res) => {
  const { entries, active } = readModelEntries();
  respond(res, entries, active);
});

router.post('/', (req, res) => {
  const { entries } = readModelEntries();
  try {
    const record = normalizeModelInput(req.body || {}, req.body?.vendor || 'custom');
    entries.push(record);
    const active = req.body?.activate ? record.id : readModelEntries().active;
    writeModelEntries(entries, active);
    respond(res, entries, active);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { entries } = readModelEntries();
  const index = entries.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '模型服务不存在' });
  try {
    const record = normalizeModelInput(req.body || {}, req.body?.vendor || 'custom', entries[index]);
    entries[index] = record;
    writeModelEntries(entries, readModelEntries().active);
    respond(res, entries, readModelEntries().active);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const { entries, active } = readModelEntries();
  const index = entries.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '模型服务不存在' });
  entries.splice(index, 1);
  const nextActive = active === req.params.id ? (entries[0]?.id || 'deepseek') : active;
  writeModelEntries(entries, nextActive);
  respond(res, entries, nextActive);
});

router.post('/:id/activate', (req, res) => {
  const { entries } = readModelEntries();
  if (!entries.some((item) => item.id === req.params.id)) {
    return res.status(404).json({ error: '模型服务不存在' });
  }
  writeModelEntries(entries, req.params.id);
  respond(res, entries, req.params.id);
});

router.post('/:id/test', async (req, res) => {
  const { entries } = readModelEntries();
  const record = entries.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: '模型服务不存在' });
  try {
    const provider = getProvider(record.protocol);
    const result = await provider.chat({
      system: '你是连通性测试助手。',
      user: '请只回复两个字母：ok',
      maxTokens: 32,
      thinkingType: 'disabled',
      timeoutMs: 20000,
      entry: record
    });
    res.json({ ok: true, model: record.model, reply: String(result.content || '').slice(0, 60) });
  } catch (err) {
    res.status(400).json({ error: '连接失败：' + err.message });
  }
});

// 拉取模型列表：body.id 用已存条目（编辑场景）；否则用 body 的 vendor/baseUrl/apiKey（新增场景）。
// 返回合并后的列表（预设优先 + 远端补缺）。
router.post('/fetch-models', async (req, res) => {
  const body = req.body || {};
  try {
    let baseUrl = String(body.baseUrl || '').trim();
    let apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    let presetModels = presetModelsFor(String(body.vendor || ''));
    if (body.id) {
      const { entries } = readModelEntries();
      const record = entries.find((item) => item.id === body.id);
      if (!record) return res.status(404).json({ error: '模型服务不存在' });
      baseUrl = record.baseUrl || baseUrl;
      apiKey = record.apiKey || apiKey;
      presetModels = presetModelsFor(record.vendor);
    }
    if (!baseUrl) {
      return res.status(400).json({ error: '接口地址（baseUrl）不能为空' });
    }
    // 本地厂商（如 Ollama）可无 Key 拉列表；需要鉴权的厂商未填 Key 时由远端返回错误并透出提示
    const models = await listRemoteModels({ baseUrl, apiKey, presetModels });
    res.json({ models });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
