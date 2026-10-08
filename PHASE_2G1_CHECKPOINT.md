# Phase 2G.1 — Recover lesson-plan structure

Date: 2026-10-08. Teacher-authorized local checkpoint. No push.

## Git safety / branch

- Isolated branch: `feature/elearning-studio-phase-2g1`.
- Worktree: `C:/Users/user/.codex/worktrees/elearning-phase-2g1/App Elearning cho GV`.
- Base commit: `926b4357a8fd1cbc36f963506427b050d8c402ba` (published Phase 2E).
- Original checkout remains on `feature/elearning-studio-phase-2f1`. Its four tracked modifications, backup implementation, checkpoint, five test files and private test-fixtures directory remain unstaged/uncommitted and untouched.
- Created a separate managed worktree, then created the Phase 2G branch there. Did not switch the dirty original checkout, stash, reset, clean, merge or commit Phase 2F.1. Teacher browser storage and localhost process were not accessed or changed.
- IMPORTANT: This worktree does not contain the uncommitted Phase 2F.1 implementation or its 43 tests. No combined 2F.1/2G.1 integration PASS is claimed. Teacher-approved checkpointing/integration is still required later.

## Skills

Inspected installed skills and used using-agent-skills, git-workflow-and-versioning, test-driven-development, incremental-implementation, api-and-interface-design, frontend-ui-engineering and code-review-and-quality. No skill installation or modification.

## Private acceptance input

Read the exact original `test-fixtures/TUẦN 5.docx` from the original checkout, in memory. Did not copy the document into this worktree or add it to Git. SHA-256 before/after: `48ae17e9acdff3a9e07cd91a5ee34c7c499e76a011fde382b9dab3605b71847b`.

Committed-test candidates use a synthetic DOCX generated in memory with generic objectives/actions/answer choices. No original teacher paragraphs or image binaries are included in those tests. The real document is a local acceptance input, not a CI dependency.

## Original failure → new result

| Item | Before (read-only diagnostic) | Revised exact-document run |
|---|---|---|
| Lesson title | Lost lesson number; kept T1 abbreviation | Bài 3 — MÁY TÍNH VÀ EM (Tiết 1), original capitalization retained |
| Top-level activities | 2, including an unidentified activity | 5/5, in source order |
| Total duration | null; planner proposed 22 minutes | 35 minutes from all five explicit parent durations |
| Knowledge/skill objectives | Empty; subsection label treated as an outcome | Four actual source objectives; label is structural |
| Nested discovery timing | Lost | 9 + 8 beneath the 17-minute parent |
| HSKT | Column content misclassified as discovery | Global support plus source-activity support |
| Grade | Extraction empty; downstream planner could silently default | Both grades UNKNOWN; import wizard blocks unknown-grade planning |

The earlier pipeline run generated 26 slides, not the teacher-reported 32. This subphase does not change generation logic or claim a new slide-count acceptance result.

## Activity mapping / time extraction — PASS

| Source activity | Stage | Minutes | Nested minutes | HSKT entries |
|---|---|---:|---|---:|
| Khởi động | OPENING | 5 | — | 1 |
| Hình thành kiến thức | DISCOVERY | 17 | 9, 8 | 2 |
| Luyện tập | PRACTICE | 5 | — | 1 |
| Vận dụng | APPLICATION | 5 | — | 1 |
| Củng cố, dặn dò | APPLICATION | 3 | — | 0 (none declared) |

Nested timing is not double counted. Total is derived only if every top-level activity duration is known and no explicit total already exists. Partial parent timing remains unknown. Source traces record the derived total; subdivisions retain block/row/column references.

Full-width cells are interpreted paragraph by paragraph. Numbered activity headings create boundaries; activity-local objectives and bare consolidation subheadings stay inside their parent. Existing table column mappings survive structural spanning rows. Minute notation supports straight apostrophe, curly apostrophe and prime, alongside existing minute/hour formats.

## Objective extraction / HSKT / source preservation — PASS for extracted text

- Four actual knowledge/skill objectives recognized, plus existing two competencies and four qualities. Objective section headings and lead-in phrases are not instructional outcomes.
- Teacher/student text remains separate and in source order within each field. Activity goals remain separate from whole-lesson objectives.
- Five support entries from the HSKT column attach to the appropriate four activities; the introductory HSKT objective is also retained globally.
- Exact-document coverage: **159/159 extracted non-empty source paragraphs** represented by classifications with matching block, row and column; **0 uncovered paragraphs**. Original text remains in imported blocks/classifications even when display values remove bullet prefixes or normalize the title.
- Source multiple-choice choices and B/B, C answers, matching answer sequence, and application suggested response remain as source teacher/student text. No question/answer synthesis or restructuring implemented.
- The final spanning consolidation cell has no separate teacher/student/support columns. Its six narrative paragraphs remain in activity.content rather than inventing student/support roles. Four miscellaneous preparation/week/adjustment paragraphs remain available in unmappedContent.

## Grade provenance / confirmation

- Curriculum grade and target learner grade remain separate string values. Exact DOCX declares neither: both display Chưa xác định, source UNKNOWN, unconfirmed.
- Provenance distinguishes DOCUMENT, TEACHER, UNVERIFIED and UNKNOWN. Source evidence is derived from traces before confirmation; confirmation persists value/source/sourceText/confirmed in the optional backward-compatible gradeProvenance contract.
- Editing a grade invalidates its previous confirmation. Mismatch requires two valid, current, teacher-confirmed comparable values.
- Semantic normalization cannot invent a grade or replace an explicit source declaration with an AI suggestion. Controlled-provider regressions cover both cases; teacher edits remain independent.
- Normal import flow cannot advance with both grades unknown. It asks the teacher for a grade instead of reaching the existing grade-4 fallback.
- Scope limitation: generation/blueprint modules were deliberately not modified. The direct legacy blueprint provider still has its existing fallback if invoked outside the guarded wizard; no claim that every internal API fallback was removed. A confirmed explicit curriculum grade remains usable by the existing planner when no separate target grade is supplied.

## Tests / build / diff check

- Original 419 committed-baseline tests retained; no tests deleted, skipped, or assertions removed.
- Two existing regressions adapted to new requirements: mismatch test now checks no warning before confirmation and warning after confirmation; navigation fixture explicitly supplies a learner grade. All navigation/edit assertions retained.
- New tests: **18** (9 structural, 7 grade/provenance, 2 review/wizard).
- Final `npm test`: **437/437 PASS**, 30 files, 14.04 seconds, run started 14:49:50 local time.
- Final `npm run build`: **PASS**, TypeScript and Vite, 1788 modules, 4.37-second bundling. Existing non-fatal Zod PURE annotation and >500 kB chunk warnings remain.
- `git diff --check`: **PASS**. Git's existing LF/CRLF conversion notices are non-fatal. Intended new files formatted with the installed Prettier.
- Tests/build and worktree mutations used approved outside-sandbox execution for filesystem/esbuild access. No permission changes or configuration workaround.
- RED/GREEN evidence includes failing activity/time/mapping regressions, missing grade helper, AI-invented grade regressions and title-number regression, followed by passing focused/full checks. An unused test import caused a build failure and was removed before the final successful build.

## Review / known limitations / deferred

Reviewed intended diff for correctness, interface compatibility, source preservation, privacy and scope. No dependency/lockfile changes, secrets, environment files, teacher document copies, screenshots or generated archives are intended changes. node_modules/dist remain ignored, not staged.

- Acceptance used the existing deterministic analyzer on the real DOCX; live AI-provider acceptance and native browser acceptance of this worktree were not performed. Semantic grade behavior is tested with controlled responses only.
- 159/159 coverage is text-extraction coverage, not OCR or preservation of seven image binaries. DOCX media reuse, image-only matching-table transcription, image search/relevance and original-question structuring remain deferred. Existing image/OCR warning remains.
- Ambiguous vertically merged or nested tables retain the existing conservative warning/unmapped behavior; not every possible Word table layout is certified.
- Subactivity titles/timing/provenance are represented; teacher/student descriptions remain ordered under the parent activity with cell traces, not a new nested activity editor.
- No generation, image retrieval, teacher projects, browser data or localhost changes. No claim that slide inflation has been fixed.
- Phase 2F.1 integration remains pending teacher-approved checkpointing. Phase 2G.2, 2G.3 and 2G.4 not started.

## Exact intended changed files

Modified:
- src/import/AnalysisReview.tsx
- src/import/LessonImportWizard.tsx
- src/import/analyzer.ts
- src/import/model.ts
- src/import/review.ts
- src/import/semantic.ts
- src/import/structure.ts
- tests/phase2a-controls.test.tsx
- tests/phase2a.test.tsx

New:
- src/import/grades.ts
- tests/phase2g1-structure.test.ts
- tests/phase2g1-grades.test.ts
- tests/phase2g1-review.test.tsx
- PHASE_2G1_CHECKPOINT.md

Local checkpoint authorized by the teacher after review. No push or next phase.

## Local checkpoint verification — 2026-10-08

Approved outside-sandbox execution confirmed Windows account `giaovien/user`; no ownership, ACL or global Git safety settings changed. Re-ran 437/437 tests PASS (30 files, 12.23s, started 14:57:43), build PASS (1788 modules, 3.83s bundling), and diff check PASS. Only the 14 intended files listed above are included in the local checkpoint commit. The original Phase 2F.1 checkout remains separate with its uncommitted work; no teacher document or data is staged. Commit identity is recorded in Git history.
