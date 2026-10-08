# PHASE 2G.3B CHECKPOINT — teacher review

## Baseline and Git safety

- Repository: F:\Codex\e-learning-studio.
- Verified starting branch: feature/elearning-studio-phase-2g3a.
- Base and current HEAD: 5a82e809d4af173a2d686f1e9a9f59cd74339191.
- Implementation branch: feature/elearning-studio-phase-2g3b.
- Starting tracked tree/index were clean; test-fixtures/ was already untracked.
- No staging, commit, push, merge, reset, clean, rebase, ownership/ACL changes, or other worktree changes.
- Normal-user approved outside-sandbox execution was used for test/build temporary writes.

## Skills applied

Installed agent-skills 0.6.12 SKILL.md files were inspected: test-driven-development, incremental-implementation, api-and-interface-design, code-review-and-quality, git-workflow-and-versioning. Implementation proceeded through failing synthetic regressions, incremental heading/period/role recovery, compatible optional contracts, source review, and Git state verification. No Skills were installed or modified.

## Implementation

- Recognize numbered/repeated-punctuation headings, discovery descriptions, incomplete brackets, and consolidation/homework variants; retain original source text.
- Exclude general time introductions, dotted blanks, teacher notes, assessment boundaries and worksheet headings from parent activity creation.
- Resolve GV/HS/HSKT from each cell's column interval and explicit paragraph labels. Horizontal spanning cells crossing roles require explicit evidence; contradictory GV/HS labels remain review content. HSKT labels can identify support within a GV column.
- Preserve ambiguous cells and nested-table text rather than guessing roles. Multiple unknown paragraphs in a cell remain together as one review item.
- Recover explicit period groups and numbered child tasks without inferring period count from activity count.
- Keep period, parent and child durations separate; flag incomplete/conflicting allocations without summing parent and children together.
- Add optional analysis-level period/activity provenance: original text, block ID, zero-based table/row/column, confidence and review status. Period duration traces retain the source of the explicit minutes-per-period declaration.
- Canonical LessonProject schema, AI providers and generation logic remain unchanged.

## Private-document acceptance

Exact input: test-fixtures/KHBD BÀI 4. LÀM VIỆC VỚI MÁY TÍNH.docx.
SHA256: 41835e902fff51697d6dd715ad71f1f72ea567cefbc730c3314a5fb238d4d0d0 (unchanged).
The document remains untracked and was not staged. Extraction and deterministic analysis ran on the exact local file.

| Measure | Phase 2G.3A baseline | Phase 2G.3B |
|---|---:|---:|
| Parent activities | 9, including unresolved placeholder | 12 source-backed parents |
| Explicit period grouping | Not represented | 3 source groups, 4 parents each |
| Child tasks recovered | 0 | 3 |
| GV paragraph assignments | 0 | 130 |
| HS paragraph assignments | 0 | 104 |
| HSKT assignments within activities | 0 | 29 |
| Unmapped review items | 147 | 188 |
| Review warnings | 6 | 9 |
| Recognized parent allocation sum | 44 minutes | 77 minutes, plus one unresolved allocation |

Unmapped counts increased because previously broad cell assignments now preserve uncertain role paragraphs for review; this is not a content-removal metric. All 510 nonempty extracted source paragraphs are represented in classification source text (0 missing), including merged-cell content. This checks extracted text coverage, not OCR or visual-layout equivalence.

Metadata remains TIN HỌC, grade 3, Bài 4 — LÀM VIỆC VỚI MÁY TÍNH, source declaration 3 periods × 35 minutes = 105 minutes. The existing 21 categorized requirements remain: 5 subject, 4 general, 4 digital, 4 AI and 4 qualities. Direct learningOutcomes/knowledgeObjectives arrays stay empty because these statements occur under competency/quality headings; they are not fabricated or duplicated as separate objectives.

**Teacher correction:** actual teaching is 2 × 35 = 70 minutes. The DOCX declares 3 periods and contains TIẾT 1, TIẾT 2 and TIẾT 3 headings. This conflict is explicitly recorded here for teacher review; the parser retains the source declaration and does not hard-code two periods or overwrite metadata. The parser cannot infer an external correction from the DOCX alone.

| Source group | Parent activities in order | Known parent sum |
|---|---|---:|
| TIẾT 1, block-47 | Khởi động 5; Khám phá 15; Luyện tập 3; Vận dụng unresolved (incomplete opening bracket) | 23/35, incomplete |
| TIẾT 2, block-49 | Khởi động 5; Khám phá kiến thức 3: Chuột máy tính… 15; Thực hành 10; Vận dụng 5 | 35/35 |
| TIẾT 3, block-51 | Khởi động 5; Thực hành 8; Luyện tập 3; Vận dụng 3 | 19/35 |

The third-period practice parent retains three child tasks: one untimed, one 12 minutes, one 7 minutes. Known child total 19 conflicts with parent 8 and is warned about; it is not added to the 77-minute parent sum. Period lengths retain block-46 provenance. Missing minutes are unresolved.

Nine review warnings cover missing assessment recovery, images/drawings without OCR, ambiguous rows in three teaching tables, parent total 77 versus declared 105, incomplete first-period allocation, third-period allocation mismatch, and parent/child conflict. Assessment questions/answers and worksheet content remain available for review rather than becoming fabricated activities.

## Validation

- Baseline: 483 tests, preserved without edits, skips or removals.
- New: 25 synthetic sanitized tests in tests/phase2g3b-activities.test.ts.
- Final npm test: 508/508 PASS across 36 files.
- npm run build: PASS.
- git diff --check: PASS.
- Existing nonblocking dependency-comment and >500 kB bundle warnings remain.
- Mutation check: intentionally shifting period numbers by 10 failed the grouping regression as expected; original bytes were restored. A separate warmup-only mutation was not detected by the selected heading tests because the compatibility recognizer also handles warmup; this is not claimed as mutation coverage.
- Source review found and fixed a TypeScript narrowing issue before final checks. Existing vertical-merge conservative behavior remains covered by the unchanged baseline tests.

## Files and limitations

Intended files: src/import/analyzer.ts, src/import/model.ts, src/import/structure.ts, new src/import/activityStructure.ts, new src/import/tableRoles.ts, new tests/phase2g3b-activities.test.ts, and this checkpoint.

Nested/irregular tables and vertical merged-header continuation rows still use conservative review fallback. Affected vertical continuation rows may keep neighboring cells unresolved; subsequent safe rows recover normally. Numbered untimed child headings use bounded structural heuristics and remain reviewable. Ambiguous role boundaries, assessment/question-answer extraction and OCR remain unresolved. No new slide generation, SCORM, HTML export, AI provider or image generation was implemented. Source paragraph retention does not assert that text embedded in images was extracted.

Working tree contains intended uncommitted Phase 2G.3B files and pre-existing untracked test-fixtures/. Index remains empty. STOP for teacher review; no commit or push.
