# Interactive Chat Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the novel workspace to persistent, interactive one-book-one-page chat with staged concept collection, confirmation-based generation, book widgets, and side-by-side editing.

**Architecture:** Chat history is stored inside each book record in `data/books.json`. Draft sessions are book records with `status: "draft"`. The backend owns the conversation state machine and DeepSeek calls; the frontend workspace page owns book selection, chat rendering, and the side-by-side reader.

**Tech Stack:** Existing React + Vite + Express stack; no new dependencies.

## Global Constraints

- Model stays `deepseek-v4-flash` via `DEEPSEEK_MODEL`.
- No database; all persistence remains in `data/*.json`.
- Version bumps to `0.2.0` in root, `client/package.json`, and `server/package.json`.
- Existing routes remain compatible where possible.
- `SUMMARY.md`, `TARGET.md`, and `README.md` must be updated.

## Data Model

Each book gains:

```json
{
  "status": "draft" | "ready",
  "chat": [
    {
      "id": "m_...",
      "role": "user" | "agent",
      "content": "文本",
      "kind": "text" | "question" | "confirm" | "summary" | "book" | "error",
      "bookId": "b_...",
      "createdAt": "ISO"
    }
  ],
  "draft": {
    "concept": "首轮构思",
    "summary": "整合后的构思"
  }
}
```

Draft books have `chapters: []` and `title: "未命名新书"`. Older books without these fields are normalized on read.

## API Changes

- `POST /api/chat/sessions` -> create draft book, returns `{ book }`.
- `POST /api/chat/message` -> `{ bookId, content }`, appends user message, advances agent state, returns `{ book }`.
- `GET /api/books` now includes `status` and draft books.
- `GET /api/books/:id` returns the full book including `chat`.
- Existing chapter save endpoint stays for manual edits.

## Agent Flow

1. User sends a concept to a draft session.
2. Backend asks the model for the next missing item one at a time: 主角、故事背景、分类。
3. When all items exist, the model returns an integrated summary.
4. Agent posts the summary and asks whether to modify.
5. User can confirm or send modifications; each modification re-runs summary collection.
6. On confirmation, the backend generates title, outline, chapters, and relations into the same book record and posts a book widget message.
7. Ready books accept: continue next chapter, rewrite an existing chapter, or answer plot questions.

## Frontend Changes

- Replace `/create` and `/continue` with `/workspace`.
- Sidebar keeps 创作、我的、书架、设置; 续写 is merged into 创作.
- Workspace top bar lists `＋ 新创作` plus all user books.
- ChatPanel loads and saves `book.chat`; messages render question, summary, confirm, and book widget variants.
- Book widget button opens a side-by-side reader next to the chat.
- BookSidePanel supports content/relations tabs and autosave editing.

## Tasks

1. Write update plan and version docs.
2. Backend chat service, draft sessions, message endpoint.
3. Backend generation, rewrite, continue, relation updates.
4. Frontend workspace page, book selector, chat panel rewrite.
5. Book widget and side-by-side reader.
6. Docs and version bump.
7. Tests, build, smoke verification, commit.
