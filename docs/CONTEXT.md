# Novel Agent 上下文快照（交接用）

> 生成于 2026-08-11。此文件用于会话压缩/新会话时恢复项目状态。

## 现状

- 项目：Novel Agent，本地小说创作平台（React + Express + DeepSeek），分支 `Develop`，当前版本 **0.5.18**，工作区干净。
- 后端测试 34/34；构建通过；后端运行于 3001（有外网权限）。
- 数据：`data/*.json`（books/users/settings），原子写 + `.bak` 备份，gitignore 排除。

## 核心架构（Agent 化）

- `server/src/services/toolkit.js`：工具协议层。ReAct 多步循环（`maxSteps` 默认 30，正常 1-5 步），参数 schema 硬校验 + 失败回传重试（上限 3），可 `{"reply":"..."}` 直接结束。
- `prefilterIntent`：意图预筛双模式。输入当天聊天记录 + 能力组 + 当前消息 + 书籍上下文；输出 `mode:chat`（直接回复，不调工具）或 `mode:tool`（选组 + 输出规模覆盖 `output:{chapters,chapterWords}`）。
- 工具（`server/src/services/tools.js`，按组 read/edit/write/navigate 注册）：
  - `edit_book`：target 硬枚举 `title / summary / content / outline`，`chapter` + `value`；
  - `continue_book`：续写（按设置/用户规模）；
  - `read_book`：info/chapters/chapter；
  - `batch_fix_chapter_prefixes`：批量规范“第X章”前缀（arabic/chinese，默认 arabic）；
  - `batch_replace_text`：批量替换文本（覆盖书名/简介/概况/时间线/草稿/章节全字段）；
  - `open_book_widget`：书籍卡片（并列/详情，带 chapter 定位）。
- 草稿阶段：`ask_draft_question` / `confirm_draft`（完整聊天记录作上下文）。
- 全书概况：`book.timeline`（结构化事件列表，按 chapterIndex）+ `book.storySummary`（散文）。`syncBookOverview` 在章节新增/改写/摘要编辑时差分更新（AI 返回该章条目 + 散文，后端替换/追加/移除）；`ensureTimeline` 用于旧书迁移。
- 其他：DeepSeek 调用 120s 超时、可中断（■）；写回前合并防覆盖；章节/书籍详情覆盖层在顶栏（56px）下方，压栈保留原页状态。

## 行为约定（重要）

- 删除章节 = 纯后端、无 AI：移除章节 + 移除该章 timeline 条目（`applyTimelineChanges`），`storySummary` 散文**不更新**；弹窗提示“可在聊天中让 AI 重建全书概况”。
- 手动编辑章节正文 = 冷保存，不触发 AI；问 AI 时 `read_book` 读最新内容。
- 批量替换后书内全字段一致（不依赖聊天记忆覆盖）。
- 关系网仅手动“重新生成”（`POST /api/books/:id/relations`）。
- 设置：默认输出章节数/默认输出字数（用户明确指定时顶替）；发送快捷键 Enter/Ctrl+Enter 互斥；常规与外观分标签。
- 当天聊天记忆只作讨论上下文，不覆盖书内真实状态。

## 待办（已讨论、未开工）

- **0.5.19 候选 1**：按位置插入/重建章节（`edit_book` 支持插入或新工具；删除/插入后章节序号重排策略需定）。
- **0.5.19 候选 2**：`rebuild_story_summary` 工具——从当前全部章节摘要整体重建 timeline + storySummary（兑现删除弹窗的“AI 重建概况”）。
- 未来功能（暂不做）：时间线视图、按章节锚点、关系网事件溯源、“回到某时间点分支”。

## 常用命令

```bash
npm.cmd --prefix server test
npm.cmd --prefix client run build
```

后端启动：`server` 目录 `node src/index.js`（需外网访问 DeepSeek）。
