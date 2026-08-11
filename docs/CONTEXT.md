# Novel Agent 上下文快照（交接用）

> 生成于 2026-08-11。此文件用于会话压缩/新会话时恢复项目状态，请先读此文件再继续。

## 现状

- 项目：Novel Agent，本地小说创作平台（React 18 + Vite 5 / Express 4 / DeepSeek，JSON 本地持久化），当前版本 **0.6.2**（外观更新：跟随系统与护眼绿主题）。
- 当前开发分支：`feature/0.6-relations-timeline`（自 `Develop` 创建，0.6.0 已完成并提交；按 0.6 规划**暂不合并** develop，0.6.x 继续在本分支开发，功能大部分完成后并入 develop）。
- 后端测试 41/41；前端构建通过；后端运行于 3001（有外网权限，DeepSeek 真实调用可验证；沙箱内本机 HTTP 直连需 curl + 提权）。
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
  - `storyMetaService.js`：故事元数据——关系网“顺序分块增量”生成（`extractRelations` 支持 `mode: incremental|full|auto`；纯函数 `splitIntoBlocks` / `changedChaptersSince`）+ 章节事迹轴派生视图（`buildTimeline`）；
  - `lib/modelCall.js`：公共 `callModel`（重试 + 校验），三服务共用；`lib/chapterUtils.js`（定位/前缀/`isLastChapter`）、`lib/bookUtils.js`（normalizeBook，含 timeline→events 确定性迁移）。
- 数据模型：`chapter.{title, content, summary, events[]}` + `book.storySummary`（精简散文，被动派生，prompt 约束 300-800 字）+ `book.relations {nodes, edges, generatedAt, coveredUpTo, mode}`；`book.timeline` 已删除并迁移清理。

## 行为约定（重要）

- 删除仅支持末尾章：前端仅末尾章悬停显示删除按钮，后端 `isLastChapter` 校验并 400 拒绝非末尾删除；删除后异步 `updateOverviewTail` 更新概况结尾（不阻塞请求，失败仅记日志）；`read_book(field:overview)` 保留只读兜底。
- 手动编辑章节正文：失焦/自动保存只写库；“真正编辑完成”（切换标签、关闭面板、返回导航，即编辑器卸载）才先保存再触发 `POST /summary` 维护摘要/事件/概况；问 AI 时 `read_book` 读最新内容。
- 手动新建章节必须输入实际章节名：去掉“第n章”前缀后为空（只回车/失焦）则不创建。
- 批量替换后书内全字段一致（含章节事件），不依赖聊天记忆覆盖。
- 关系网仅手动“重新生成”（`POST /api/books/:id/relations`，支持 `{mode: 'incremental'|'full'}`，缺省按标记自动选择）；续写/改写不自动更新关系网。增量只处理 `coveredUpTo` 之后与覆盖范围内 `updatedAt > generatedAt` 的章节，每块摘要 ≤ 3500 字符 / 25 章。
- 设置：背景风格顺序为“跟随系统 / 浅色 / 深色 / 护眼绿 / 护眼纸纹”，默认护眼纸纹；跟随系统走 `prefers-color-scheme` 媒体查询即时适配；默认输出章节数 1-5 / 默认输出字数每章 1000-10000（用户明确指定时顶替）；写书调用（生成/续写/改写）maxTokens 32768，元数据/工具调用统一 4096；发送快捷键 Enter/Ctrl+Enter 互斥；常规与外观分标签。
- 当天聊天记忆只作讨论上下文，不覆盖书内真实状态；工具决策循环也携带当天聊天。
- 推理模型注意：maxTokens 过低会因 `reasoning_tokens` 挤占预算返回空内容（“未返回内容”），小调用不得低于 4096。

## 最近完成（0.5.20 → 0.6.2）

- 0.5.20：删除收敛为仅末尾章 + 概况结尾差分；移除 `rebuildOverview` 与 `edit_book(overview)`；修复推理模型空响应（小调用 maxTokens 统一 4096）。
- 0.5.21：写书调用 maxTokens 8192 → 32768（按模型实测）；设置范围定 1000-10000。
- 0.5.22：`syncChapterOverview` 输入差分（去掉全书事件列表）；模块拆分（overviewService / storyMetaService / modelCall）；删除 `ensureChapterEvents` 全量迁移函数（新书首章事件走 syncChapterOverview，旧 timeline 迁移由 normalizeBook 确定性完成）。
- 0.6.0：关系网改为“顺序分块增量”（full 置空逐块重建 / incremental 保留现有只处理新增变更章节，消除唯一 O(章数) 输入）；`relations` 新增 `generatedAt`/`coveredUpTo`/`mode` 标记；新增 `GET /api/books/:id/timeline`（章节事迹轴，零 AI）；详情页新增“时间线”第三标签（章节展开显示事件卡）；版本号统一 0.6.0（根 package.json 由 0.5.18 补齐）。
- 0.6.1：修复新建章节“只有第n章前缀也创建”的 bug（必须有实际章节名才新建）；摘要/事件维护触发从“失焦”改为“编辑器卸载”（切标签/关面板/返回），先保存最新改动再 `POST /summary`，与改写共用 `syncChapterOverview` 内核。
- 0.6.1（续）：修复关系网重新生成后滚轮缩放失效——滚轮监听改依赖 `hasGraph`，空态转有数据时重新绑定。
- 0.6.1（续）：修复详情页头部间距——`.side-panel-head` gap 由 32px 改 0（0.5.8 引入后从未回退，与 0.5.18 的 16px margin 叠加成 48px），总间距恢复 16px。
- 0.6.1（续）：创作台聊天头部“并列查看”右侧新增“详情查看”按钮（按钮式），点击走 `OverlayStack.open` 压栈唤出全屏详情页，返回出栈。
- 0.6.2：主题扩展——新增“跟随系统”（`prefers-color-scheme` 媒体查询）与“护眼绿”，顺序为 跟随系统/浅色/深色/护眼绿/护眼纸纹；默认主题改为护眼纸纹（后端白名单/默认值、前端设置页与应用兜底统一）。
- 0.6.2（续）：设置保存失败提示改为 toast 样式（红底“保存失败：原因”），移除容器内 `form-error`。
- 0.6.2（续）：构思统一“意愿初筛”（`prefilterDraftIntent`，chat/confirm/over），分类非必填、“由你决定”直接整合构思；规模解析并入初筛，越界确定性返回“当前输出超过限定”，ready 路径同样生效；初筛与预筛提示词限制“只谈创作”并防提示词注入。

## 已知问题与后续规划（0.6.1 / 0.6.2）

- 0.6.1：关系网交互升级（节点拖拽、按类型/重要度筛选、搜索定位、hover 人物详情）；时间线视图继续打磨。
- 0.6.2：联动（时间线事件↔章节跳转、人物↔关系网高亮）+ 大图性能（节点过滤/聚合）与空态打磨。
- 其他未来功能（暂不做）：事件时间字段（真实时间线，向前兼容）、按章节锚点、关系网事件溯源、“回到某时间点分支”。

## 常用命令

```bash
npm.cmd --prefix server test
npm.cmd --prefix client run build
```

后端启动：`server` 目录 `node src/index.js`（需外网访问 DeepSeek；沙箱内网络受限，真实验证需提权/普通终端）。
