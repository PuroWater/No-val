// 文笔风格预设（0.9.8）：后端单一来源，前端只选 id；prompt 只注入正文，不外发。
// 新增/调整风格只需改这里，正文注入与接口自动跟随。
export const WRITING_STYLES = [
  { id: 'default', label: '默认', description: '平实自然，用词准确，叙事清晰。', prompt: '' },
  { id: 'concise', label: '简洁明快', description: '短句为主，少修饰，情节推进干脆。', prompt: '文笔简洁明快：多用短句，少用长修饰与冗词，对白与叙述都干脆利落，情节推进不拖沓。' },
  { id: 'delicate', label: '细腻铺陈', description: '注重环境、动作、神态与心理细节。', prompt: '文笔细腻铺陈：注重环境、动作、神态与心理细节，描写层次丰富、画面感强，但不拖慢主线。' },
  { id: 'colloquial', label: '口语生活', description: '叙述与对白自然贴近日常口语。', prompt: '文笔口语生活：叙述与对白自然贴近日常口语，生动接地气，避免过度书面化。' },
  { id: 'literary', label: '书面文艺', description: '用词雅致、书面语为主，富有文学质感。', prompt: '文笔书面文艺：用词雅致、以书面语为主，句式讲究，富有文学质感。' },
  { id: 'ornate', label: '辞藻华丽', description: '修饰丰富、画面感强，但保持可读性。', prompt: '辞藻华丽：用词精雕细琢、修饰丰富，画面感强，但不堆砌到影响可读性。' },
  { id: 'rhythmic', label: '排句节奏', description: '长短句错落，善用排比、对偶与节奏感。', prompt: '排句节奏：句式长短错落，善用排比、对偶与节奏变化，读起来有韵律感。' }
];

export function resolveWritingStyle(id) {
  return WRITING_STYLES.find((item) => item.id === String(id)) || WRITING_STYLES[0];
}
