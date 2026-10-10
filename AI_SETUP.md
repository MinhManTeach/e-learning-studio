# Personal local AI setup

## AI thiết kế bài giảng (Claude or Gemini)

The editor button **AI thiết kế bài giảng** makes one call for the whole lesson with the
teacher's own key. The AI proposes (1) a card design for knowledge pages — numbered steps,
two columns (Nên / Không nên), timeline, mind map, flip cards — and (2) 3–6 practice
activities placed after the page they practise: ordering, sorting into two groups,
matching, true/false, multiple choice and a branching scenario. It also fills missing
explanations of existing questions. The teacher ticks what to keep; nothing is removed,
existing answers never change, and **Hoàn tác cải thiện** undoes the whole change.

`.env.local` (one key is enough; `sk-ant-` keys are Claude, `AIza` keys are Gemini):

```
LESSON_AI_API_KEY=your-key
# optional: LESSON_AI_PROVIDER=anthropic|gemini, LESSON_AI_MODEL=claude-haiku-5-5 (default)
#           or gemini-3.8-flash (default for Gemini), LESSON_AI_THINKING=low (Gemini only)
# optional, pictures (Gemini only, needs Billing): LESSON_AI_GEMINI_KEY=your-gemini-key
```

Restart `npm run dev` after editing. Endpoints (dev server only, local callers only):
`GET /api/lesson-ai/studio/status`, `POST /api/lesson-ai/studio/design`,
`POST /api/lesson-ai/studio/illustrate`. Keys stay in the Node process; only error codes
reach the browser. Overloaded answers (503/529) are retried twice; nothing else is retried
automatically. Videos are never generated: lessons use the videos in the PowerPoint.

## Lesson-plan analysis (OpenAI) — Phase 2A.3

Without configuration, run `npm ci` then `npm run dev` and use **Phân tích cơ bản**.
All automated tests work without credentials; no test contacts a real AI provider.

To enable real semantic analysis:

1. Copy `.env.example` to `.env.local` in the repository root.
2. Set `LESSON_AI_PROVIDER=openai`, `LESSON_AI_MODEL` to an OpenAI model supporting
   Chat Completions with strict JSON schema output, and `LESSON_AI_API_KEY` to your key.
   The example model is `gpt-4.1-mini`; availability depends on your OpenAI account.
3. Restart `npm run dev`. Open the printed `http://127.0.0.1:5173` URL.
4. Open **Cài đặt · AI hỗ trợ**. “Đã cấu hình” means the configuration is present and
   syntactically valid, not that credentials or quota have been verified.
5. Import the current lesson and select **Phân tích bằng AI**. This sends the current
   lesson's structured content to OpenAI and can incur API charges. Basic mode remains available.
6. A successful validated response is marked **Phân tích bằng AI**. Connection, quota,
   timeout, refusal, truncation, JSON, schema or source-reference failures show a basic-mode
   fallback warning. Failed retries preserve existing teacher corrections.

The key stays in the local Node/Vite process. It is not a `VITE_*` value, not returned by
the status endpoint, not stored in browser preferences, LessonProject, analysis exports,
snapshots or checkpoints. Never commit `.env.local`, paste a key into a lesson, or log it.
The UI uses same-origin `/api/lesson-ai/status` and `/api/lesson-ai/analyze` only.
Provider-specific HTTP and the versioned instruction live under `server/`.

The local endpoint only runs in `npm run dev`; it rejects remote sockets and cross-origin
callers. `npm run build` and `npm run preview` are basic-only until a separately secured
server/edge adapter implements these endpoints. Do not publicly deploy or expose this
personal development server. No browser-bundled key is used or described as secure.
Moving behind a server later does not require changing the lesson analysis service contract.

The model receives ordered blocks (heading levels, paragraphs, lists, tables, cells, GV/HS
columns and IDs) in a separate JSON data message. It receives no other saved projects,
file names, browser storage or personal configuration. The system instruction forbids
obeying commands inside a lesson, invention and chain-of-thought. This is prompt-injection
resistance, not a guarantee that a model cannot misclassify content; teacher review is required.

No automatic request retries are made (avoids duplicate API charges). Retry is a teacher action.
The provider has a 60-second timeout and the browser connection a 65-second timeout.
Progress is an honest whole-document waiting state, not fabricated streaming stages.
Confidence is advisory: high-confidence conflicting local evidence caps the score at 0.84.
Scores >=0.85 are accepted, 0.60–0.84 shown for review, and <0.60 kept as uncertain.

Implementation reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
