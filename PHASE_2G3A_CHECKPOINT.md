# PHASE 2G.3A CHECKPOINT

Status: IMPLEMENTED — awaiting teacher review. No commit or push.

## Branch and safety

- Repository: F:\Codex\e-learning-studio
- Initial branch: feature/elearning-studio-phase-2g2
- Implementation branch: feature/elearning-studio-phase-2g3a
- Base and current HEAD: de0bee1e51fcc54758beffef05d0304cd3e32c2e
- Initial working tree: only untracked test-fixtures/.
- Created the new branch without discarding files or changing the base commit.
- No merge, reset, clean, rebase, force-push, staging, commit or push.
- No other worktrees or Phase 2F.1 files modified.
- Canonical LessonProject schema unchanged. No project migration required.
- Private DOCX remains untracked; no private binary or teacher project was added to tests.

## Skills inspected and applied

Read the installed SKILL.md files under:
C:/Users/Khin/.codex/plugins/cache/agent-skills/agent-skills/0.6.12/skills/

- test-driven-development: failing regression tests before behavior changes; focused red/green runs.
- incremental-implementation: metadata/period recovery, category precedence, hierarchy, provenance and review-summary increments.
- api-and-interface-design: optional additions to the existing import-analysis contract; legacy duration and activity fields retained.
- code-review-and-quality: correctness, readability, architecture, security and performance review, plus a targeted mutation check.
- git-workflow-and-versioning: verified baseline, created requested branch, kept the private fixture untracked and staged index empty.

Skills were not installed or modified. The explicit instruction not to commit overrides skill save-point recommendations.

## Real acceptance document

The exact user-provided DOCX was readable and analyzed through importPlanFile and DeterministicLessonAnalysisProvider.

- Size: 1,122,885 bytes.
- SHA256 before/after: 41835e902fff51697d6dd715ad71f1f72ea567cefbc730c3314a5fb238d4d0d0
- Extraction remains 82 blocks, 8 tables and 9 image placements.
- All 510 nonempty extracted source paragraphs are represented in classification source text. This checks preservation, not complete semantic understanding or OCR.
- Acceptance is a local, in-memory run; the private DOCX is not an automated test dependency.

## Before/after metadata

| Field | Before | After |
|---|---|---|
| Subject | Empty | TIN HỌC |
| Curriculum grade | Empty | 3 |
| Learner/target grade | Empty | Empty; not inferred |
| Lesson number | Unavailable | 4 |
| Lesson title | Empty | Bài 4 — LÀM VIỆC VỚI MÁY TÍNH |
| Period count | Unavailable | 3 |
| Minutes per period | Unavailable | 35 |
| Total lesson duration | Unresolved | 105 minutes |

Casing from source is retained. Subject identity is Tin học. No grade 4 or other fallback is introduced.

Recovery supports common subject/grade headings, numbered lesson headings with punctuation, labels without colons, and explicit period declarations. Existing colon-title and session-title behavior remains compatible.

## Learning outcomes and competency classification

Requirements now retain one primary category plus an isRequiredOutcome parent-context flag. requiredOutcomeStatements exposes source-backed categorized requirements without copying them into unrelated objective arrays.

| Result | Before | After |
|---|---:|---:|
| Review summary: required outcomes / knowledge | 0 | 21 |
| Standalone learningOutcomes array | 0 | 0 |
| Knowledge/skills objectives array | 0 | 0 |
| Subject-specific competencies | Mixed | 5 |
| General competencies | Mixed | 4 |
| Combined compatibility competencies array | 13, including misclassified AI | 9 |
| Digital competencies | 4 | 4 |
| AI competencies | 0 | 4 |
| Personal qualities | 4 | 4 |

The source nests its requirements under competency and quality headings. Therefore its standalone outcome and knowledge arrays correctly remain empty; the summary no longer mistakes that organization for absent requirements. No objectives were invented.

- AI competency heading recognition precedes general competency recognition.
- competencyKind distinguishes SUBJECT_SPECIFIC, GENERAL and UNSPECIFIED within the compatibility competencies array.
- Alphabetic c) and d) headings are no longer interpreted as top-level Roman numerals. All 21 statements retain their required-outcome parent context.
- Existing original sourceText, block IDs and available table coordinates remain attached.
- The missing-outcome warning respects categorized requirements.

## Period model and provenance

Optional import-analysis fields:

- periodCount: explicit number of teaching periods.
- minutesPerPeriod: explicit period length.
- totalDurationMinutes: total lesson time.
- activityDurationMinutes: per-activity allocation.
- lessonNumber: explicit lesson number.

Existing durationMinutes and estimatedMinutes remain compatibility fields. Teacher edits to the existing total/activity fields synchronize their new counterparts.

- Three periods alone never become three minutes.
- Without an explicit period length, the total is unresolved and a warning is retained; activity sums do not substitute for the missing period length.
- Explicit count and period length derive a total.
- An explicit conflicting total is retained and warned about, with its own source provenance.
- Allocation discrepancies are flagged without changing the source numbers.

Actual acceptance provenance:

| Value | Source blocks |
|---|---|
| Subject and curriculum grade | block-1 |
| Lesson number and title | block-2 |
| Period count | block-3 and block-46 |
| Minutes per period | block-46 |
| Derived 105-minute total | block-3 and block-46 |

Each trace retains original source text, block ID, line range and confidence. Grade provenance is DOCUMENT and remains unconfirmed until teacher review. Target learner grade remains UNKNOWN.

## Review count and remaining limitations

- Unmapped review items: 150 before → 147 after.
- Warnings: 10 before → 6 after.
- Activities: 9 before → 9 after, including an unresolved activity placeholder.
- Recognized activity allocations total 44 minutes versus the explicit 105-minute lesson. The warning states this may reflect missing activities or conflicting allocations; it does not assert the document itself totals 44 minutes.
- Complex GV/HS merged-table mapping remains unchanged.
- Assessment-table recovery, question/answer extraction and malformed activity-heading recovery remain outside this subphase.
- OCR is not implemented.
- Bare subject/grade detection uses a bounded common-subject vocabulary; unknown subjects still need explicit labels or teacher review.
- TXT/paste metadata and period recovery are covered; the richer parent/subtype classification is provided by the existing structured-document path.
- This checkpoint validates deterministic analysis. No AI provider contract or service was added or changed.
- Historical 18-item output remains unverified; the reproducible baseline for this exact document and commit was 150.

## Tests and validation

- Baseline: 460/460 tests PASS across 34 files.
- New: 23 regression tests in tests/phase2g3a-recovery.test.ts.
- Final: 483/483 tests PASS across 35 files.
- Existing tests preserved without edits, skips or removals.
- New tests use synthetic DOCX archives and sanitized text only.
- Coverage includes bare subject/grade, numbered title, colonless labels, 3 × 35 minutes, period-only input, conflicting totals/allocations, AI/digital/general/subject classification, direct outcomes, missing grade, grade provenance, no fabricated objectives, c)/d) hierarchy, review summary, old JSON compatibility, teacher-edit synchronization and source preservation.
- Mutation check: replacing period-count multiplication with addition caused the targeted 105-minute regression test to fail. The original implementation was restored before final verification.
- npm test: PASS.
- npm run build: PASS.
- git diff --check: PASS.
- Build retains nonblocking dependency-comment and >500 kB bundle warnings; no new dependency or build configuration change.
- Git status: only intended implementation/checkpoint files plus pre-existing untracked test-fixtures/.
- Staged index: empty.

## Files changed

- src/import/model.ts: backward-compatible optional analysis fields.
- src/import/lessonMetadata.ts: declaration recovery and distinct period/total handling.
- src/import/structure.ts: metadata integration, AI precedence, alphabetic hierarchy and source flags.
- src/import/analyzer.ts: metadata/period recovery across deterministic input paths.
- src/import/outcomes.ts: source-backed required-outcome view and summary count.
- src/import/review.ts: categorized outcome warning and compatibility-field synchronization.
- src/import/AnalysisReview.tsx: accurate requirement summary and existing explanatory hint.
- tests/phase2g3a-recovery.test.ts: 23 synthetic regression tests.
- PHASE_2G3A_CHECKPOINT.md: this checkpoint.

STOPPED for teacher review. Phase 2G.3B has not started.
