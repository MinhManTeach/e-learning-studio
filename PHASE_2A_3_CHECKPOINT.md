# E-Learning Studio — Phase 2A.3 checkpoint

BRANCH: `feature/elearning-studio-phase-2a3`

BASE COMMIT: `2b2bee607379ae0352dedbb4d2db673da79099c8`

LOCAL CHECKOUT: `C:\Users\Khin\Documents\Codex\2026-10-08\co\work\e-learning-studio`

BASELINE: exact requested commit on `feature/elearning-studio-phase-2a`; clean working tree;
259/259 tests passed; `npm run build` passed before implementation. No baseline repairs.

AI PROVIDER ARCHITECTURE: UI → LessonAnalysisService → SemanticLessonAnalysisProvider →
LocalServerSemanticConnection → same-origin local endpoint → isolated OpenAI adapter.
DeterministicLessonAnalysisProvider retained for missing configuration, selected basic mode,
and provider/validation failures. No React component calls fetch or a vendor SDK directly.
The HTTP connection contract can move behind a secured server/edge function later.

CONFIGURATION: Cài đặt · AI hỗ trợ displays provider, model and configuration status.
`.env.example` documents server-only `LESSON_AI_PROVIDER`, `LESSON_AI_MODEL`, and secret
configuration. Copy to ignored `.env.local`, configure locally, restart `npm run dev`.
Only OpenAI is implemented in this phase. Configured status does not claim verified credentials.
See AI_SETUP.md for operating instructions and limitations.

SECRET HANDLING: key remains in the Node/Vite server process; never a VITE_* value, never
returned by status, never sent to the browser, never put in LessonProject or export JSON.
No key logging, error-body reflection, snapshots or checkpoint secrets. No new dependencies.
The loopback-only endpoint rejects remote sockets, invalid hosts and cross-origin requests;
requires JSON; validates input and limits requests to 2 MB. API key is used only in the
server's provider Authorization header. Browser build scan found no provider URL, Bearer
header or secret environment-variable references in production assets.

SEMANTIC INSTRUCTION: `server/instruction.ts`, `vi-primary-pedagogy-v1`. Extraction and
classification only, teacher terminology retained, no invented sections or curriculum,
context/parent sections/lists/tables/GV-HS preserved, explicit labels distinguished from
mere AI or pupil mentions, headings and lead-ins structural, short evidence codes only.

STRUCTURED OUTPUT: OpenAI Chat Completions with strict JSON schema generated from the
existing Phase 2A.2 response contract. Optional properties become nullable on the wire;
wire nulls for optional identity and reasoning fields normalize back into that contract.
No free-prose parsing, no streaming, no tools, no automatic charge-producing retries.
Provider response storage is disabled in the request.

VALIDATION: local request schema strips unrelated properties; provider runtime validates
the JSON contract; semantic normalization validates source IDs and source-document identity;
service validates PedagogicalAnalysis before UI review. Refusals, truncated responses,
malformed JSON, invalid fields and unknown source references fall back safely.

SOURCE TRACEABILITY: each extracted item supplies sourceBlockIds; existing sourceTraces
and classifications retain block IDs, source text and indexed review fields. Unknown block
references reject the AI result. No chain-of-thought is requested or stored.

CONFIDENCE: >=0.85 accepted; 0.60–0.84 accepted with Nên kiểm tra; <0.60 uncertain.
Conflicting high-confidence local structural evidence caps the model's score at 0.84,
with related objective/activity categories treated as compatible. Medium and low review
counts are separated. Confidence is an application review policy, not calibrated probability.

FALLBACK: no config honestly shows AI chưa được kết nối and basic mode. Failed configured
AI shows “Không thể kết nối AI. Kết quả hiện tại được tạo bằng chế độ phân tích cơ bản.”
Manual basic choice bypasses the semantic connection. Failed AI retries retain existing
teacher edits and show an error instead of replacing those edits with fallback output.

CANCELLATION: AbortSignal propagates browser → endpoint → provider; provider timeout 60s,
browser timeout 65s; request listeners/timers cleaned up; existing wizard protections reject
late canceled responses. Imported DOCX and existing draft survive cancel/failure.

PROMPT-INJECTION PROTECTION: versioned system instruction is separate from the JSON
UNTRUSTED_DOCUMENT_DATA envelope. Uploaded commands remain data; input-provided instructions
are not promoted into system messages. Regression asserts malicious text stays in the data
message and cannot replace the system instruction. This does not prove that every real
model response is immune to malicious lesson content; validation and teacher review remain.

REVIEW UX: configured AI primary action plus basic alternative, honest whole-document waiting
state and cancellation, AI/basic badges, summary counts before collapsed review sections,
editable fields, confirmation before replacement, failed-retry edit preservation.
Existing Phase 1 editor and schema 2.2 kept intact; no redesign or generation features.

REAL FAILURE REGRESSION: `tests/fixtures/phase2a3-semantic-failure.txt` contains the reported
lead-in, two learning statements, full AI 5.A1.1 responsibility text and competency heading
and child. Mocked semantic output through the actual HTTP connection adapter produces two
learning outcomes, AI integration and competency with valid source references; headings
and lead-in are absent from uncertain content. Exact sentences occur only in test data/tests.

TESTS: `npm test` — 295/295 pass across 12 files (original 259 retained, 36 added).
New coverage includes configuration/missing/invalid, valid response, malformed JSON/schema,
unknown source, fallback warning, confidence boundaries/conflict, source trace, section
context, explicit AI integration, structural exclusions, injection separation, cancellation
and late responses, network, timeout, rate limit, retry/edit preservation, table/GV-HS
payloads, secret-free exports, local endpoint origin/type/size restrictions, strict schema.

BUILD: `npm run build` — PASS. Existing third-party Zod Rollup annotation warnings persist,
as in the baseline; no build errors. `git diff --check` — PASS.

MANUAL TEST: localhost `http://127.0.0.1:5173` verified through the real browser:
settings shows no AI connection; imported repository `src/fixtures/docx/real-lesson-ai.docx`;
basic-mode review produces 3 knowledge objectives, 2 competencies, 1 quality, 6 activities;
edited lesson title; declined replacement and confirmed edit retained; opened Phase 1
sample (14 slides); no captured browser console errors. Review screenshot delivered separately.
Automated UI tests additionally verify failed AI retry preserves edits and successful retry.

REAL AI TEST STATUS: NOT RUN — no local API key configured. No fabricated AI run or claim
of real semantic accuracy. The teacher's exact original failure DOCX was not attached;
repository real DOCX fixture and the reported failure text were used. Real-provider acceptance
with that original DOCX remains a follow-up after local configuration.

FILES CREATED:

- `.env.example`, `AI_SETUP.md`, `PHASE_2A_3_CHECKPOINT.md`
- `server/instruction.ts`, `server/openai.ts`, `server/localAiPlugin.ts`
- `src/import/AiSettings.tsx`, `src/import/localAiConnection.ts`
- `tests/fixtures/phase2a3-semantic-failure.txt`
- `tests/phase2a3-provider.test.ts`, `tests/phase2a3-pipeline.test.ts`
- `tests/phase2a3-server.test.ts`, `tests/phase2a3-ui.test.tsx`

FILES MODIFIED:

- `vite.config.ts`, `src/App.tsx`, `src/styles.css`
- `src/import/analysisService.ts`, `src/import/semantic.ts`
- `src/import/LessonImportWizard.tsx`, `src/import/AnalysisReview.tsx`

KNOWN LIMITATIONS: local dev server adapter only; build/preview use basic mode without a
separately secured endpoint. OpenAI only, with a model supporting strict structured output.
Real provider behavior, quota and the exact original DOCX acceptance remain unverified.
Analysis drafts remain session-only, matching Phase 2A.2. Prompting is resistance rather
than a security guarantee. No claims of streaming or calibrated model confidence.

DEFERRED: accounts, roles, subscriptions, billing, hosted deployment, additional vendors,
blueprint/slide generation, images/media, SCORM/ZIP, certificates and TTS.

NEXT: Phase 2B — Automatic Lesson Blueprint Generator, only after user review and a new request.

DELIVERY: local branch only. No push, merge or Phase 2B work. Stop for user review.
