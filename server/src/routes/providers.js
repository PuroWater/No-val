// 模型服务（provider）管理接口（0.9.6）：列表/新增/编辑/删除/设当前/测试连接。
// 数据存 data/providers.json（全局）；无文件时用环境变量推导默认 deepseek。
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  PROVIDER_PRESETS,
  readProviders,
  writeProviders,
  normalizeProviderInput,
  maskProvider
} from '../lib/providersStore.js';
import { provider as openaiProvider } from '../services/providers/openaiCompatible.js';

const router = Router();
router.use(requireAuth);

function respond(res, providers, active) {
  const activeProvider = providers.find((item) => item.id === active) || providers[0] || null;
  res.json({
    providers: providers.map(maskProvider),
    active,
    activeProvider: activeProvider ? maskProvider(activeProvider) : null,
    presets: Object.fromEntries(
      Object.entries(PROVIDER_PRESETS).map(([key, preset]) => [
        key,
        {
          name: preset.name,
          baseUrl: preset.baseUrl,
          defaultModel: preset.defaultModel,
          models: (preset.models || []).map((item) => ({ id: item.id, label: item.label }))
        }
      ])
    )
  });
}

router.get('/', (req, res) => {
  const { providers, active } = readProviders();
  respond(res, providers, active);
});

router.post('/', (req, res) => {
  const { providers } = readProviders();
  try {
    const record = normalizeProviderInput(req.body || {}, req.body?.preset);
    providers.push(record);
    const active = req.body?.activate ? record.id : readProviders().active;
    writeProviders(providers, active);
    respond(res, providers, active);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { providers } = readProviders();
  const index = providers.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '模型服务不存在' });
  try {
    const record = normalizeProviderInput(req.body || {}, req.body?.preset, providers[index]);
    providers[index] = record;
    writeProviders(providers, readProviders().active);
    respond(res, providers, readProviders().active);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const { providers, active } = readProviders();
  const index = providers.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '模型服务不存在' });
  providers.splice(index, 1);
  const nextActive = active === req.params.id ? (providers[0]?.id || 'deepseek') : active;
  writeProviders(providers, nextActive);
  respond(res, providers, nextActive);
});

router.post('/:id/activate', (req, res) => {
  const { providers } = readProviders();
  if (!providers.some((item) => item.id === req.params.id)) {
    return res.status(404).json({ error: '模型服务不存在' });
  }
  writeProviders(providers, req.params.id);
  respond(res, providers, req.params.id);
});

router.post('/:id/test', async (req, res) => {
  const { providers } = readProviders();
  const record = providers.find((item) => item.id === req.params.id);
  if (!record) return res.status(404).json({ error: '模型服务不存在' });
  try {
    const result = await openaiProvider.chat({
      system: '你是连通性测试助手。',
      user: '请只回复两个字母：ok',
      maxTokens: 16,
      thinkingType: 'disabled',
      timeoutMs: 20000,
      config: record
    });
    res.json({ ok: true, model: record.model, reply: String(result.content || '').slice(0, 60) });
  } catch (err) {
    res.status(400).json({ error: '连接失败：' + err.message });
  }
});

export default router;
