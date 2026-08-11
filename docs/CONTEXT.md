# Novel Agent 上下文快照（交接用）

> 生成于 2026-08-11。此文件用于会话压缩/新会话时恢复项目状态。

## 现状

- 项目：Novel Agent，本地小说创作平台（React + Express + DeepSeek），分支 `Develop`，当前版本 **0.5.21**（生成上限提升与设置范围收敛）。
- 后端测试 35/35；构建通过；后端运行于 3001（有外网权限）。
- 数据：`data/*.json`（books/users/settings），原子写 + `.bak` 备份，gitignore 排除。

## 核心架构（Agent 化）

- `server/src/services/toolkit.js`：工具协议层。ReAct 多步循环（`maxSteps` 默认 30，正常 1-5 步），参数 schema 硬校验 + 失败回传重试（上限 3），可 `{"reply":"..."}` 直接结束。
- `prefilterIntent`：意图预筛双模式。输入当天聊天记录 + 能力组 + 当前消息 + 书籍上下文；输出 `mode:chat`（直接回复，不调工具）或 `mode:tool`（选组 + 输出规模覆盖 `output:{chapters,chapterWords}`）。
- 工具（`server/src/services/tools.js`，按组 read/edit/write/navigate 注册）：
  - `edit_book`：`action: update | insert`；target 硬枚举 `title / summary / content / outline`；
  - `continue_book`：续写（按设置/用户规模）；
  - `read_book`：`field: info/chapters/chapter/overview`，`maxChars` 控制正文节选（默认 3000、上限 8000）；
  - `batch_fix_chapter_prefixes`：批量规范“第X章”前缀（arabic/chinese，默认 arabic）；
  - `batch_replace_text`：批量替换文本（覆盖书名/简介/概况/草稿/章节正文摘要事件全字段）；
  - `open_book_widget`：书籍卡片（并列/详情，带 chapter 定位）。
- 草稿阶段：`ask_draft_question` / `confirm_draft`（完整聊天记录作上下文）。
- 全书概况：各章内嵌 `chapter.events`（事件 + 人物）+ `book.storySummary`（散文，被动派生视图）。写路径统一走 bookService 写内核：`ensureChapterEvents` / `syncChapterOverview` / `updateOverviewTail` / `applyChapterEvents`。
- 其他：DeepSeek 调用 120s 超时、可中断（■）；写回前合并防覆盖；章节/书籍详情覆盖层在顶栏（56px）下方，压栈保留原页状态。

## 行为约定（重要）

- 删除仅支持末尾章：前端仅末尾章显示删除按钮，后端 `isLastChapter` 校验并 400 拒绝非末尾删除；删除后异步 `updateOverviewTail` 差分更新概况结尾（只发旧概况 + 新末章，O(1)）；`read_book(field:overview)` 保留为只读兜底。
- 手动编辑章节正文 = 冷保存，不触发 AI；问 AI 时 `read_book` 读最新内容。
- `deepseek-v4-flash` 为推理模型：小规模元数据/工具调用 `maxTokens` 必须 ≥ 3000，否则 `reasoning_tokens` 会挤占预算导致空内容（已统一）。
- 批量替换后书内全字段一致（含章节事件），不依赖聊天记忆覆盖。
- 关系网仅手动“重新生成”（`POST /api/books/:id/relations`）。
- 设置：默认输出章节数 1-5 / 默认输出字数每章 1000-10000（用户明确指定时顶替）；写书调用 maxTokens 上限 32768（API 实测 deepseek-v4-flash 支持远大于 8192），元数据/工具调用统一 4096；发送快捷键 Enter/Ctrl+Enter 互斥；常规与外观分标签。
- 当天聊天记忆只作讨论上下文，不覆盖书内真实状态。

## 未来功能（暂不做）

- 时间线视图（可基于 chapter.events 派生）、按章节锚点、关系网事件溯源、“回到某时间点分支”。
- 长小说全书聚合优化：`syncChapterOverview` 输入差分（去全量事件）、`extractRelations` / `ensureChapterEvents` 分块 map-reduce。当前这些路径输入为 O(章数)，数百章以上会爆上下文；删除已收敛为末尾章 + O(1) 结尾差分；日常续写/改写/问答无此问题。

## 常用命令

```bash
npm.cmd --prefix server test
npm.cmd --prefix client run build
```

后端启动：`server` 目录 `node src/index.js`（需外网访问 DeepSeek）。
