// 终极真实回归：只创建新的测试书，不读取/复制现有用户书籍；所有测试书保留在系统中。
// 运行：EVAL_BASE_URL=http://localhost:3101 node server/scripts/eval/ultimateRealTest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.EVAL_BASE_URL || 'http://localhost:3101';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REPORT_PATH = path.join(ROOT, 'docs', `ultimate-real-test-report-${new Date().toISOString().slice(0, 10)}.json`);
const RESUME_FINAL_BOOK_ID = process.env.RESUME_FINAL_BOOK_ID || '';
const ONLY_FINAL = process.env.ONLY_FINAL === '1';
let priorReport = null;
if (RESUME_FINAL_BOOK_ID && fs.existsSync(REPORT_PATH)) {
  try { priorReport = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')); } catch { priorReport = null; }
}
const results = priorReport?.results || [];
const createdBooks = priorReport?.createdBooks || [];
let token = '';
let originalSettings = null;
let currentSettings = null;
let finalBookId = priorReport?.finalBookId || null;

function log(message) {
  console.log(`[ultimate] ${message}`);
}

function record(name, ok, detail, extra = {}) {
  const item = { name, ok: Boolean(ok), detail, ...extra };
  results.push(item);
  console.log(`  ${item.ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
  writeReport();
  return item.ok;
}

function writeReport() {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    base: BASE,
    note: '仅包含本次新建测试书和测试结果；未读取或复制既有用户书籍。',
    createdBooks,
    finalBookId,
    results
  }, null, 2), 'utf8');
}

async function request(pathname, { method = 'GET', body, expected = null } = {}) {
  const response = await fetch(BASE + pathname, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (expected && response.status !== expected) {
    throw new Error(`${method} ${pathname} expected ${expected}, got ${response.status}: ${JSON.stringify(data)}`);
  }
  return { status: response.status, data };
}

async function login() {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: '123456' },
    expected: 200
  });
  token = response.data.token;
}

async function getSettings() {
  const response = await request('/api/settings', { expected: 200 });
  currentSettings = response.data.settings;
  return currentSettings;
}

async function setSettings(patch) {
  const base = currentSettings || await getSettings();
  const next = { ...base, ...patch };
  const response = await request('/api/settings', { method: 'PUT', body: next, expected: 200 });
  currentSettings = response.data.settings;
  return currentSettings;
}

async function createSession(label) {
  const response = await request('/api/chat/sessions', { method: 'POST', expected: 201 });
  const book = response.data.book;
  createdBooks.push({ id: book.id, label, titleAtCreation: book.title, status: book.status });
  if (label.includes('30章')) finalBookId = book.id;
  return book;
}

async function getBook(bookId) {
  const response = await request(`/api/books/${bookId}`, { expected: 200 });
  return response.data.book;
}

function messageId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function send(bookId, content, id = messageId('ultimate')) {
  const response = await request('/api/chat/message', {
    method: 'POST',
    body: { bookId, content, messageId: id }
  });
  if (response.status !== 200) throw new Error(`消息返回 ${response.status}: ${JSON.stringify(response.data)}`);
  return response.data.book;
}

async function sendWithRetry(bookId, content, prefix, retries = 1) {
  const id = messageId(prefix);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await send(bookId, content, id);
    } catch (error) {
      lastError = error;
      log(`${prefix} 第 ${attempt + 1} 次失败：${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const latest = await getBook(bookId).catch(() => null);
      if (latest && latest.chat?.some((item) => item.kind === 'processing')) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }
  throw lastError;
}

async function assertInvalidSettings(name, patch, expectedText) {
  const base = currentSettings || await getSettings();
  const response = await request('/api/settings', { method: 'PUT', body: { ...base, ...patch } });
  const ok = response.status === 400 && String(response.data.error || '').includes(expectedText);
  record(name, ok, `status=${response.status}, error=${response.data.error || ''}`);
}

async function runBoundaryTests() {
  log('开始边界值与接口防御测试');
  const base = await getSettings();
  originalSettings = { ...base, thinkingStages: { ...(base.thinkingStages || {}) } };
  await assertInvalidSettings('章节数下界 0 拒绝', { chaptersPerOutput: 0 }, '每次输出章节数');
  await assertInvalidSettings('章节数上界 6 拒绝', { chaptersPerOutput: 6 }, '每次输出章节数');
  await assertInvalidSettings('每章字数下界 999 拒绝', { chapterWords: 999 }, '每章字数');
  await assertInvalidSettings('每章字数上界 10001 拒绝', { chapterWords: 10001 }, '每章字数');
  await assertInvalidSettings('thinkingMode 非法值拒绝', { thinkingMode: 'maybe' }, '模型思考设置');
  await assertInvalidSettings('审校开关非布尔值拒绝', { reviewAfterWrite: 'yes' }, '生成后审校');
  await assertInvalidSettings('思考细分非布尔值拒绝', { thinkingStages: { writing: 'yes' } }, '模型思考细分');

  for (const [name, patch] of [
    ['章节数下界 1 接受', { chaptersPerOutput: 1 }],
    ['章节数上界 5 接受', { chaptersPerOutput: 5 }],
    ['每章字数下界 1000 接受', { chapterWords: 1000 }],
    ['每章字数上界 10000 接受', { chapterWords: 10000 }]
  ]) {
    const settings = await setSettings({ ...patch, chapterWords: patch.chapterWords || base.chapterWords, chaptersPerOutput: patch.chaptersPerOutput || base.chaptersPerOutput });
    record(name, settings != null, `设置已保存：${JSON.stringify(patch)}`);
  }
  await setSettings(base);

  const empty = await request('/api/chat/message', { method: 'POST', body: { content: '   ' } });
  record('空白消息拒绝', empty.status === 400 && /请输入内容/.test(String(empty.data.error)), `status=${empty.status}, error=${empty.data.error || ''}`);
  const missing = await request('/api/chat/message', { method: 'POST', body: { bookId: 'b_does_not_exist', content: '测试不存在的书' } });
  record('不存在书籍拒绝', missing.status === 502 && /不存在/.test(String(missing.data.error)), `status=${missing.status}, error=${missing.data.error || ''}`);
}

async function runFuzzyAndConcurrencyTests() {
  log('开始模糊请求、模糊提问与并发测试');
  await setSettings({ chaptersPerOutput: 1, chapterWords: 1000, thinkingMode: 'off', reviewAfterWrite: false, confirmBeforeWrite: false });

  const fuzzyBook = await createSession('模糊请求测试');
  let latest = await sendWithRetry(fuzzyBook.id, '我想写一部真实感较强的近未来悬疑小说：故事发生在沿海城市临港，女主角林澜是旧档案修复师，发现一批被人为抹除的潮汐灾害记录。请先理解这个方向，不要急着写正文。', 'fuzzy_intro');
  record('完整自然语言构思请求', latest.status === 'draft' && latest.chat?.length >= 2, `status=${latest.status}, chat=${latest.chat?.length}`);
  latest = await sendWithRetry(fuzzyBook.id, '嗯。', 'fuzzy_short');
  record('极短模糊回复', latest.chat?.length >= 4, `status=${latest.status}, chat=${latest.chat?.length}`);
  latest = await sendWithRetry(fuzzyBook.id, '那你现在到底理解成什么了？先用很简单的话告诉我。', 'fuzzy_question');
  record('模糊提问要求复述理解', latest.chat?.length >= 6 && !latest.chat?.some((item) => item.kind === 'processing'), `status=${latest.status}, last=${String(latest.chat?.at(-1)?.content || '').slice(0, 80)}`);

  const concurrentBook = await createSession('同书并发测试');
  const concurrentResults = await Promise.allSettled([
    send(concurrentBook.id, '我想写一部发生在旧火车站的短篇悬疑，先记录这个设定。', messageId('concurrent_a')),
    send(concurrentBook.id, '补充：核心人物是一名夜班检票员，故事要有现实逻辑。', messageId('concurrent_b'))
  ]);
  const concurrentBookLatest = await getBook(concurrentBook.id);
  const fulfilled = concurrentResults.filter((item) => item.status === 'fulfilled').length;
  const rejected = concurrentResults.filter((item) => item.status === 'rejected').length;
  const pendingCount = concurrentBookLatest.chat.filter((item) => item.kind === 'processing').length;
  record('同书双请求串行/不留 processing', fulfilled >= 1 && pendingCount === 0, `fulfilled=${fulfilled}, rejected=${rejected}, chat=${concurrentBookLatest.chat.length}, processing=${pendingCount}`);
  record('并发消息均有明确落盘结果', concurrentBookLatest.chat.filter((item) => item.role === 'user').length >= 2, `userMessages=${concurrentBookLatest.chat.filter((item) => item.role === 'user').length}`);
}

async function finalizeDraft(bookId) {
  let latest = await getBook(bookId);
  const confirmations = [
    '确认，按刚才的构思正式定稿并开始第一章。',
    '信息确认无误，请直接开始创作，不需要再次提问。',
    '请将前面的内容视为最终设定，生成第一章。'
  ];
  for (let i = 0; i < confirmations.length && latest.status === 'draft'; i += 1) {
    latest = await sendWithRetry(bookId, confirmations[i], `final_confirm_${i + 1}`);
  }
  return latest;
}

async function runFinalNovelTest() {
  log('开始创建并保留 30 章真实小说');
  const resumed = Boolean(RESUME_FINAL_BOOK_ID);
  let final;
  let latest;
  if (resumed) {
    final = await getBook(RESUME_FINAL_BOOK_ID);
    finalBookId = final.id;
    if (!createdBooks.some((item) => item.id === final.id)) {
      createdBooks.push({ id: final.id, label: '30章真实小说终极测试（续测）', titleAtCreation: final.title, status: final.status });
    }
    latest = final;
    record('续接已保留的 30 章小说测试书', latest.status === 'ready', `id=${latest.id}, chapters=${latest.chapters.length}`);
  } else {
    await setSettings({ chaptersPerOutput: 1, chapterWords: 2000, thinkingMode: 'off', reviewAfterWrite: false, confirmBeforeWrite: false });
    final = await createSession('30章真实小说终极测试');
    const concept = '请创作一部真实感强、人物关系连续、适合长期连载的近未来悬疑小说。暂定方向：沿海城市临港在一次异常潮汐后，旧档案修复师林澜发现被删除的灾害记录；港口调度员周既明、退休海洋测绘员顾沉舟和记者苏晚晴逐步卷入真相。故事重点是职业细节、调查过程、现实社会关系与人物选择，不要超自然万能解释。请把线索分层铺开，保持每章有具体事件、推进和悬念，后续至少可以连续写三十章。信息已经完整，请先整理为可执行构思，书名可以包含“潮汐档案”四字，之后按设置一次生成一章。';
    latest = await sendWithRetry(final.id, concept, 'final_concept');
    record('30章小说首轮真实构思', latest.chat?.length >= 2, `status=${latest.status}, title=${latest.title}`);
    latest = await finalizeDraft(final.id);
    record('30章小说定稿并生成首章', latest.status === 'ready' && latest.chapters.length >= 1, `status=${latest.status}, chapters=${latest.chapters.length}, title=${latest.title}`);
    if (latest.status !== 'ready') throw new Error(`最终小说未进入 ready：${latest.status}`);

    // 真实验证“开思考 + 开审校”：至少让一章完整走过这两个开关。
    await setSettings({ chaptersPerOutput: 1, chapterWords: 2000, thinkingMode: 'on', reviewAfterWrite: true, confirmBeforeWrite: false });
    latest = await sendWithRetry(final.id, '再写一章：请继续推进当前调查，保留前章线索，不要重复摘要。', 'final_thinking_review', 1);
    record('开思考 + 开审校真实写作', latest.chapters.length >= 2 && latest.status === 'ready', `chapters=${latest.chapters.length}, lastTitle=${latest.chapters.at(-1)?.title}`);
  }

  // 真实验证 custom 思考档位，再关闭思考与审校进入长篇稳定批量。
  if (latest.chapters.length < 3) {
    await setSettings({ thinkingMode: 'custom', thinkingStages: { routing: false, execution: false, writing: true, review: false, maintenance: false }, reviewAfterWrite: false });
    latest = await sendWithRetry(final.id, '接着写下一章，直接推进剧情。', 'final_custom_thinking', 1);
    record('custom 思考档位真实写作', latest.chapters.length >= 3 && latest.status === 'ready', `chapters=${latest.chapters.length}`);
  } else if (resumed) {
    record('custom 思考档位真实写作', true, '续测前已有第 3 章，跳过重复写入。');
  }

  await setSettings({ thinkingMode: 'off', reviewAfterWrite: false });
  const prompts = [
    '继续写下一章，直接推进剧情，不要重复前情。',
    '请沿着当前冲突再写一章，保持人物行为符合职业和现实逻辑。',
    '下一章。',
    '再写一章，重点推进调查线索。',
    '接着写下去，让本章有明确事件和新的悬念。',
    '继续当前故事。',
    '请把故事向前推进一章。'
  ];
  let promptIndex = 0;
  let noProgress = 0;
  while (latest.chapters.length < 30) {
    const before = latest.chapters.length;
    const content = prompts[promptIndex % prompts.length];
    promptIndex += 1;
    latest = await sendWithRetry(final.id, content, `final_chapter_${before + 1}`, 1);
    const after = latest.chapters.length;
    log(`长篇进度：${before} -> ${after} 章（${String(latest.chapters.at(-1)?.title || '').slice(0, 40)}）`);
    if (after <= before) noProgress += 1;
    else noProgress = 0;
    if (noProgress >= 3) throw new Error(`连续三次未新增章节，当前 ${after} 章`);
  }
  const lengths = latest.chapters.map((chapter) => String(chapter.content || '').length);
  const approxCount = lengths.filter((length) => length >= 1600 && length <= 2400).length;
  record('真实小说达到不少于 30 章', latest.chapters.length >= 30, `chapters=${latest.chapters.length}, title=${latest.title}`);
  record('30 章字数大致落在 2000 左右', approxCount >= Math.max(25, latest.chapters.length - 3), `approx=${approxCount}/${latest.chapters.length}, min=${Math.min(...lengths)}, max=${Math.max(...lengths)}, avg=${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)}`);

  // 真实验证模糊阅读问题与明确章节问题，结果留在聊天记录中。
  latest = await sendWithRetry(final.id, '帮我看看第十章目前发生了什么，用几句话说清楚。', 'final_read_specific');
  record('明确章节阅读提问', latest.chat?.at(-1)?.kind !== 'error', `last=${String(latest.chat?.at(-1)?.content || '').slice(0, 100)}`);
  latest = await sendWithRetry(final.id, '那个关键东西后来怎么样了？', 'final_read_fuzzy');
  record('模糊剧情提问', latest.chat?.at(-1)?.kind !== 'error', `last=${String(latest.chat?.at(-1)?.content || '').slice(0, 100)}`);

  const finalBook = await getBook(final.id);
  const current = createdBooks.find((item) => item.id === final.id);
  if (current) {
    current.title = finalBook.title;
    current.status = finalBook.status;
    current.chapters = finalBook.chapters.length;
    current.outline = finalBook.outline;
  }
  return finalBook;
}

async function main() {
  writeReport();
  try {
    await login();
    if (!ONLY_FINAL) {
      await runBoundaryTests();
      await runFuzzyAndConcurrencyTests();
    }
    const finalBook = await runFinalNovelTest();
    record('最终小说状态可重新读取', finalBook.status === 'ready' && finalBook.chapters.length >= 30, `id=${finalBook.id}, status=${finalBook.status}, chapters=${finalBook.chapters.length}`);
  } catch (error) {
    record('终极测试执行过程', false, error.stack || error.message);
    process.exitCode = 1;
  } finally {
    if (originalSettings) {
      try {
        await setSettings(originalSettings);
        log('已恢复测试前用户设置。');
      } catch (error) {
        record('恢复用户设置', false, error.message);
      }
    }
    writeReport();
    const passed = results.filter((item) => item.ok).length;
    const failed = results.length - passed;
    log(`完成：${passed} PASS / ${failed} FAIL；报告：${REPORT_PATH}`);
    log(`保留测试书：${createdBooks.map((item) => `${item.id}（${item.label}）`).join('、')}`);
  }
}

main();
