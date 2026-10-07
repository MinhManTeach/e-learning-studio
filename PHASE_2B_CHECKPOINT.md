# Phase 2B — Automatic Lesson Blueprint Generator

BRANCH: `feature/elearning-studio-phase-2b`

BASE COMMIT: `68c806ce6862ec14f1fffb184d196bdb3e3d16b1`

Baseline verified before branch creation: Phase 2A.3 branch, exact HEAD, clean working tree, 295/295 tests, build PASS. Publication authorized after review: commit and push this Phase 2B branch only. No merge or Phase 2C work.

## Implementation

BLUEPRINT MODEL: `src/blueprint/model.ts` owns the active version 1.0 model and Zod schemas for slides, stages, assessment, media, accessibility, and typed ERROR/WARNING/INFO diagnostics. Includes identity, analysis reference, grades, duration provenance, rationale, timestamps, ordered slides, outcome references and design intents. No binary media or LessonProject runtime data. `src/import/model.ts` re-exports the active LessonBlueprint type; its deprecated Phase 2A preview schemas remain only for compatibility with baseline contract tests.

GENERATOR: `LessonBlueprintGenerator` requires a confirmed analysis draft. `LessonBlueprintProvider.generate(analysis)` is the future enhancement boundary. `DeterministicLessonBlueprintProvider` runs locally, without keys, AI calls, network requests, random IDs, media fetching or final lesson generation. Same analysis/settings produce identical output. The pure provider uses a documented stable epoch timestamp; the workflow stamps actual draft creation/update times.

DYNAMIC SLIDE COUNT: Depends on duration, learner grade, conceptual load, outcome gaps, source activities and assessment needs. Shorter lessons group adjacent small concepts; longer/younger-learner designs separate concepts more. Meaningful outcome gaps receive explicit learning experiences. Slides are not padded to a target count. Dense sources can exceed the guidance ranges and show warnings.

STAGE MAPPING: Honors confirmed stage selections and maps Vietnamese activity headings when no stage is set. Unknown stages are not forced and generate a review warning. Opening/discovery/practice/assessment/application describe Studio organization, without a Ministry-stage claim. Core welcome/objectives/summary/completion are proposed alongside supported learning experiences.

OUTCOME COVERAGE: Analysis 1.0 has string outcomes. Stable IDs use the confirmed analysis ID, original field and original index; knowledge objectives are the fallback when learning outcomes are empty. Actual learning/assessment experiences carry references. Objectives and summaries alone do not satisfy coverage. Uncovered, unknown, duplicate and excessive references are detected. Teachers can edit references explicitly.

TIME BUDGET: Weighted allocation accounts for structural, reading and interactive experiences. Integer hundredths and largest remainders keep the proposed sum equal to the source minute budget. Unknown/zero duration is inferred and labelled “Thời lượng đề xuất”. Teacher time edits remain authoritative; deviations over 5% or one minute produce a warning rather than silently redistributing teacher choices.

INTERACTION PLAN: Source warmup and learner activities use short participation tasks; decision-making evidence selects scenarios. Assessable outcomes recommend quiz experiences. Content does not receive a quiz by default. Interaction type and purpose are editable, with compatible quiz/scenario options.

ASSESSMENT PLAN: Need, target question count, default passing score 80, recommended types, per-outcome references and recognition/understanding/application levels. Explicit provider settings can override the score. No final questions, answers or branches are generated. Slide edits rebuild references and need flags; gaps and inconsistent plans are validated.

MEDIA PLAN: Slide-level NONE/IMAGE/VIDEO/AUDIO/ILLUSTRATION intent, purpose, optional search query/visual description and required flag. Proposed descriptions include subject, concept, primary grade and explanatory purpose. Generated defaults use illustration descriptions rather than generic queries. Required references are rebuilt from the current slides. No media is searched, downloaded or generated.

AI/DIGITAL INTEGRATION: Preserves confirmed integration text in application or decision-making experiences. Responsibility/safety/selection signals recommend a scenario with an explicit learner action. No decorative AI slide type or invented AI curriculum standard. Source safety topics are incorporated as evidence too.

ACCESSIBILITY: Preserves special-needs support in a dedicated plan. Provides short text, visual cues, alternative descriptions and color-independent communication. When support is present, includes audio/text guidance, larger targets, retry and no time pressure. No learner-facing “Dành cho HSKT” slide is created.

BLUEPRINT REVIEW UI: Confirmation automatically opens “Đề xuất kịch bản bài giảng”. Summary shows page/time/interaction/question/media counts. Ordered cards show type, stage, title, purpose, time and media/interaction indicators, with expandable outlines/intents. Plans and validation are inspectable. Uses existing Studio colors and controls, without adding a PowerPoint editor.

TEACHER EDITING: Edit slide title, purpose, outline, type, stage, estimated time, media intent, interaction intent and outcome references. Add, delete, duplicate and move slides with keyboard-accessible buttons. IDs remain unique; order and derived plans update together. Edits do not mutate PedagogicalAnalysis or the original proposal.

REGENERATION SAFETY: Edited drafts require a native modal confirmation before regeneration or restoring the proposal. The modal names the loss of edits and provides Hủy / Tạo lại (or Khôi phục). Cancel preserves current content. Native modal behavior supplies focus containment and Escape handling. Restoring and regenerating reset approval; any subsequent edit also resets approval.

VALIDATION: Version and field types, positive finite time, supported types/stages, unique IDs, sequential order, stage/media indexes, analysis identity, content completeness, conceptual/reading density, outcome coverage/duplication, assessment references/consistency, media requirements and generic queries, interaction compatibility, time budget and completion structure. Errors prevent approval; warnings permit teacher approval. Validation never rewrites teacher content.

PERSISTENCE: A dedicated `BlueprintDraft` contains immutable proposal, current edited blueprint, edit flag, approval time and teacher ID counter. The wizard holds this separately from analysis and LessonProject state. It survives closing/reopening the workflow, dashboard navigation, visiting Phase 1 projects and returning to unchanged analysis. Editing or reanalyzing the analysis invalidates its dependent blueprint. This is session retention, not durable storage: page reload, development full reload or closing the tab clears the workflow draft. The input screen already communicates the session-only limit. LessonProject schema 2.2 and project storage are unchanged.

SOURCE OF TRUTH: `BlueprintDraft.current` is the authoritative edited blueprint, including when approved. `approveBlueprint` validates and marks that current copy; it does not regenerate. Future Phase 2C must consume that current object, never the proposal, DOCX or a fresh analysis. The disabled Phase 2C button has no generation handler.

## Real lesson benchmark and browser acceptance

REAL LESSON BENCHMARK:

- Existing `tests/fixtures/phase2a3-semantic-failure.txt`: information collection/search, problem solving and 5.A1.1 human responsibility. The test applies teacher corrections from the actual fixture text because this is the known basic-parser failure fixture; it does not pretend Phase 2B repairs Phase 2A semantic extraction. Confirmed outcomes are covered, responsibility is a decision-making experience with meaningful illustration intent, assessment and completion are present, unknown duration is proposed explicitly. No fixture matching exists in production generator logic.
- Existing `src/fixtures/docx/real-lesson-ai.docx`: real extraction → analysis → blueprint tested in automation and the browser. Its two-period source has no minute duration in the analysis; the browser proposed 21 pages, 36 minutes, 15 interactions and eight planned questions, with review warnings visible.
- Browser 35-minute information-search lesson: 12 pages, exactly 35 minutes, six interactions, six planned assessment questions and seven required illustration intents. AI responsibility appears as a decision-making experience. Coverage/duplication diagnostics are available to review.

MANUAL ACCEPTANCE:

- Local app at `http://127.0.0.1:5174/` (5173 was already occupied).
- Paste → basic analysis → review → confirmation automatically reached blueprint review.
- Real DOCX file chooser → structural extraction → analysis → confirmation reached blueprint review.
- Edited a title and media description, moved a content slide, added then deleted a teacher slide. The current sequence and summary updated.
- Regeneration displayed the loss-of-edits warning. Hủy preserved edits.
- Dashboard → workflow return retained reordered title and edited media description; inspected the actual textarea value after returning.
- Approval displayed “Đã duyệt kịch bản”; Phase 2C generation remained disabled.
- Phase 1 sample project editor and student preview opened successfully.
- Captured browser error/warning logs were empty after workflow and Phase 1 checks.
- No horizontal overflow at 320, 768, 1024 or 1440 CSS-pixel viewport widths. Temporary viewport overrides reset.
- The temporary browser capture was moved outside the repository to the local visualization directory and is not versioned.

## Verification

BASELINE TESTS: 295/295 retained and passing. Two UI assertions in the existing confirmation-flow test now expect the requested new review heading and Phase 2C button label. No tests removed, skipped or weakened.

NEW TESTS: 48 across generator, review/editing, validation/heuristics and navigation workflow suites.

TOTAL TESTS: 343/343 PASS across 16 files.

BUILD: PASS (`tsc -b && vite build`). Existing Zod/Rollup annotation notices remain non-blocking, as at baseline.

DIFF CHECK: PASS (`git diff --check`). Git reports its existing LF-to-CRLF normalization notices.

FILES CREATED:

- `src/blueprint/model.ts`
- `src/blueprint/design.ts`
- `src/blueprint/generator.ts`
- `src/blueprint/validation.ts`
- `src/blueprint/draft.ts`
- `src/blueprint/BlueprintReview.tsx`
- `src/blueprint/SlideIntentEditor.tsx`
- `src/blueprint/blueprint.css`
- `tests/phase2b-generator.test.ts`
- `tests/phase2b-review.test.tsx`
- `tests/phase2b-validation.test.ts`
- `tests/phase2b-workflow.test.tsx`
- `PHASE_2B_CHECKPOINT.md`

FILES MODIFIED:

- `src/import/LessonImportWizard.tsx`: automatic generation, review integration and separate draft lifecycle.
- `src/import/model.ts`: active blueprint type boundary and deprecated preview-contract annotation.
- `tests/phase2a-controls.test.tsx`: updated next-screen/button assertions for Phase 2B.

KNOWN LIMITATIONS:

- Design is deterministic heuristics, not semantic AI reasoning. Token overlap can over-associate outcomes; duplication warnings and teacher reference editing make that visible.
- Source language is retained in outlines, which are design evidence rather than final learner prose. Long unpunctuated source concepts can still require teacher shortening and are flagged by density validation.
- Source activity minute estimates are not individually preserved; the global duration budget governs initial distribution.
- Sparse analysis receives core design proposals and a missing-content warning. Unknown source stages require teacher review.
- Draft retention is in memory for the current app session, with no cross-reload persistence or export/import for blueprints yet.
- Provider settings support an explicit passing score override; analysis 1.0 itself has no passing-score field.

DEFERRED: AI blueprint enhancement; durable blueprint storage/export; final LessonProject/slides, final quiz questions/answers/scenario branches; image search/download/generation; narration generation; HTML ZIP and SCORM export. No new runtime LessonProject schema or export behavior.

NEXT: Phase 2C — Full Lesson Generator, after user review. Phase 2B stops at the approved current LessonBlueprint. Publication is limited to the Phase 2B branch; no merge or Phase 2C work.

## Publication verification

Installed code-review-and-quality and test-driven-development skills reapplied. Review covered the generator, validation, isolated draft state, UI integration and tests. An approval-condition mutation was detected by the review tests; the exact original source bytes were restored before the final full suite. The temporary screenshot is excluded from version control. Final tests/build, staged-file hygiene, secrets scan and remote-head verification are reported in the publish response.
