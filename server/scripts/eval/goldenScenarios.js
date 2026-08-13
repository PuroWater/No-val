// golden 对话场景：真实完整链路回归（需运行中的后端 + 真实模型）。
// 每个场景：setup 准备副本 → steps 逐条消息断言 → cleanup 清理。
// 运行：npm run eval（根目录或 server 目录）。

export const REAL_BOOK_ID = 'b_1786427368514_gy5olp';

export const GOLDEN_SCENARIOS = [
  {
    name: '再写一章（恰好 1 章 + 模型总结卡片 + 无错）',
    async setup(api, token) {
      return api.createBookCopy(REAL_BOOK_ID, token, '【golden】再写一章副本');
    },
    steps: [
      {
        content: '再写一章',
        assert(book, lastMsg, ctx) {
          const ok = book.chapters.length === ctx.before + 1
            && lastMsg.kind === 'book'
            && Number(lastMsg.chapter) === book.chapters.length
            && !/失败|上限/.test(String(lastMsg.content));
          return { ok, detail: `章数 ${ctx.before}->${book.chapters.length}, kind=${lastMsg.kind}, chapter=${lastMsg.chapter}` };
        }
      }
    ]
  },
  {
    name: '发一个卡片（kind=book 且无错）',
    async setup(api, token) {
      return api.createBookCopy(REAL_BOOK_ID, token, '【golden】卡片副本');
    },
    steps: [
      {
        content: '发一个卡片',
        assert(book, lastMsg) {
          const ok = lastMsg.kind === 'book' && !/失败|上限/.test(String(lastMsg.content));
          return { ok, detail: `kind=${lastMsg.kind}, content=${String(lastMsg.content).slice(0, 60)}` };
        }
      }
    ]
  },
  {
    name: '打开第一章（混排标题副本 → 卡片定位第 1 章）',
    async setup(api, token) {
      const ctx = await api.createBookCopy(REAL_BOOK_ID, token, '【golden】混排标题副本');
      // 复现 bug 条件：第 1 章标题恢复汉字，其余保持阿拉伯
      ctx.book.chapters[0].title = '第一章 天骄蒙尘';
      await api.saveBookFile(ctx.book);
      return ctx;
    },
    steps: [
      {
        content: '打开第一章',
        assert(book, lastMsg) {
          const ok = lastMsg.kind === 'book' && Number(lastMsg.chapter) === 1 && !/失败|上限/.test(String(lastMsg.content));
          return { ok, detail: `kind=${lastMsg.kind}, chapter=${lastMsg.chapter}` };
        }
      }
    ]
  },
  {
    name: '重复消息幂等（同一 messageId 不重复写入）',
    async setup(api, token) {
      return api.createBookCopy(REAL_BOOK_ID, token, '【golden】幂等副本');
    },
    steps: [
      {
        content: '发一个卡片',
        messageId: 'golden_msg_dup',
        record(book, ctx) {
          ctx.afterFirst = book.chat.length;
        }
      },
      {
        content: '发一个卡片',
        messageId: 'golden_msg_dup',
        assert(book, lastMsg, ctx) {
          const ok = book.chat.length === ctx.afterFirst && lastMsg.kind === 'book' && !/失败|上限/.test(String(lastMsg.content));
          return { ok, detail: `chat=${book.chat.length}（首轮=${ctx.afterFirst}）` };
        }
      }
    ]
  },
  {
    name: '改写第一章（正文改写，不落入背景工具）',
    async setup(api, token) {
      return api.createBookCopy(REAL_BOOK_ID, token, '【golden】改写副本');
    },
    steps: [
      {
        content: '把第一章改写得更有悬念',
        assert(book, lastMsg) {
          const text = String(lastMsg.content || '');
          const ok = !/失败|上限/.test(text) && !/已统一.*背景|update_events_context/.test(text) && /第\s*1\s*章|第一章|天骄蒙尘/.test(text);
          return { ok, detail: `kind=${lastMsg.kind}, content=${text.slice(0, 80)}` };
        }
      }
    ]
  }
];
