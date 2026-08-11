# Novel Agent 上下文快照（交接用）

> 生成于 2026-08-11。此文件用于会话压缩/新会话时恢复项目状态，请先读此文件再继续。

## 现状

- 项目：Novel Agent，本地小说创作平台（React 18 + Vite 5 / Express 4 / DeepSeek，JSON 本地持久化），分支 `Develop`，当前版本 **0.5.22**（概况维护输入差分与故事元数据模块拆分），已提交、工作区干净。
- 后端测试 37/37；构建通过；后端运行于 3001（有外网权限，DeepSeek 真实调用可验证）。
- 数据：`data/*.json`（books/users/settings），原子写 + `.bak` 备份，gitignore 排除。
- 模型：`deepseek-v4-flash`（推理模型，官方输出上限 384K，实测接受 65536+ 的 max_tokens）。

## 核心架构（Agent 化 + 功能平行模块）

- `toolkit.js`：工具协议层。`prefilterIntent` 意图预筛双模式（chat 直接回 / tool 选组 + 输出规模覆盖），ReAct 多步循环（maxSteps 30，正常 1-5 步），schema 硬校验 + 失败回传重试（上限 3）。
- 工具（`tools.js`，按 read/edit/write/navigate 分组）：
  - `edit_book`：`action: update | insert`；target 硬枚举 `title / summary / content / outline`；
  - `continue_book`：续写（按设置/用户规模）；`read_book`：`field: info/chapters/chapter/overview`，`maxChars` 默认 3000/上限 8000；
  - `batch_fix_chapter_prefixes` / `batch_replace_text`（纯后端正则，覆盖章节事件等全字段）；`open_book_widget`（并列/详情，带 chapter 定位）。
- 草稿阶段：`ask_draft_question` / `confirm_draft`（完整聊天记录作上下文）。
- 服务模块（职责平行，命名/结构统一）：
  - `bookService.js`：书籍生命周期与写编排（新建、定稿、续写、改写、章节摘要编辑、updateBook）；
  - `overviewService.js`：概况/事件写内核——`syncChapterOverview`（输入差分，只发 全书概况 + 变更章旧/新摘要 + 变更章旧事件，O(变更数)）、`updateOverviewTail`（删末章尾部差分，O(1)）、`applyChapterEvents`、`changedEventsContext`；
  - `storyMetaService.js`：故事元数据——关系网（`extractRelations` / `sanitizeRelations`）+ 未来“时间/章节事迹轴”派生视图占位；
  - `lib/modelCall.js`：公共 `callModel`（重试 + 校验），三服务共用；`lib/chapterUtils.js`（定位/前缀/`isLastChapter`）、`lib/bookUtils.js`（normalizeBook，含 timeline→events 确定性迁移）。
- 数据模型：`chapter.{title, content, summary, events[]}` + `book.storySummary`（精简散文，被动派生，prompt 约束 300-800 字）+ `book.relations {nodes, edges}`；`book.timeline` 已删除并迁移清理。

## 行为约定（重要）

- 删除仅支持末尾章：前端仅末尾章悬停显示删除按钮，后端 `isLastChapter` 校验并 400 拒绝非末尾删除；删除后异步 `updateOverviewTail` 更新概况结尾（不阻塞请求，失败仅记日志）；`read_book(field:overview)` 保留只读兜底。
- 手动编辑章节正文 = 冷保存，不触发 AI；问 AI 时 `read_book` 读最新内容。
- 批量替换后书内全字段一致（含章节事件），不依赖聊天记忆覆盖。
- 关系网仅手动“重新生成”（`POST /api/books/:id/relations`）；续写/改写不自动更新关系网。
- 设置：默认输出章节数 1-5 / 默认输出字数每章 1000-10000（用户明确指定时顶替）；写书调用（生成/续写/改写）maxTokens 32768，元数据/工具调用统一 4096；发送快捷键 Enter/Ctrl+Enter 互斥；常规与外观分标签。
- 当天聊天记忆只作讨论上下文，不覆盖书内真实状态；工具决策循环也携带当天聊天。
- 推理模型注意：maxTokens 过低会因 `reasoning_tokens` 挤占预算返回空内容（“未返回内容”），小调用不得低于 4096。

## 最近完成（0.5.20 → 0.5.22）

- 0.5.20：删除收敛为仅末尾章 + 概况结尾差分；移除 `rebuildOverview` 与 `edit_book(overview)`；修复推理模型空响应（小调用 maxTokens 统一 4096）。
- 0.5.21：写书调用 maxTokens 8192 → 32768（按模型实测）；设置范围定 1000-10000。
- 0.5.22：`syncChapterOverview` 输入差分（去掉全书事件列表）；模块拆分（overviewService / storyMetaService / modelCall）；删除 `ensureChapterEvents` 全量迁移函数（新书首章事件走 syncChapterOverview，旧 timeline 迁移由 normalizeBook 确定性完成）。

## 已知问题与 0.6.0 规划（图形化）

- **已知 O(章数) 输入只剩一处**：`extractRelations` 的 `chapterContext` 发送全部章节摘要，长小说会爆；方案待定（候选：增量 + 定期全量 / 分块两段式）。
- 0.6.0 目标：关系网/时间线图形化升级。分期建议：
  - 0.6.0 后端：关系网增量/分块生成 + `relations` 标记字段（`generatedAt`/`coveredUpTo`）+ `POST /relations {mode: incremental|full}`；新增 `GET /api/books/:id/timeline` 派生接口（章节事迹轴 = 按章节序输出 `chapter.events`，零 AI）；
  - 0.6.1 前端：详情页第三标签“时间线”视图 + 关系网交互升级（节点拖拽、筛选、详情、搜索）；
  - 0.6.2 联动：时间线事件↔章节跳转、人物↔关系网高亮；大图性能（节点过滤/聚合）与空态打磨。
- **0.6.0 待用户决策四点**：① 关系网策略（推荐增量+定期全量）；② 时间线形态（章节轴即可，还是预留 events 时间字段）；③ 时间线入口（详情页第三标签 vs 独立视图）；④ 联动深度（先事件↔章节，人物联动下一版）。
- 其他未来功能（暂不做）：事件时间字段、按章节锚点、关系网事件溯源、“回到某时间点分支”、批量改标题/替换的小工具前缀规则（已有 batch_ 约定）。

## 常用命令

```bash
npm.cmd --prefix server test
npm.cmd --prefix client run build
```

后端启动：`server` 目录 `node src/index.js`（需外网访问 DeepSeek；沙箱内网络受限，真实验证需提权/普通终端）。
