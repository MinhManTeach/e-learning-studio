# Phase 2A corrective checkpoint

BRANCH: feature/elearning-studio-phase-2a

BASE COMMIT: f3cf40be6abfe10d5b5ecebda6a7b88f9789144f

GIT: Corrective changes remain in the working tree for user testing. No new commit or push, no merge/rebase/reset, no Phase 2B.

ROOT CAUSE: Previous Phase 2A accepted TXT only and explicitly rejected DOCX. No DOCX text or Word structure reached the analyzer. Its line-oriented rules could not preserve activity table columns or merged relationships, and synthetic plain-text fixtures did not cover real Word lesson plans. The current pass implements structural DOCX extraction before semantic classification and tests real candidate files. See DOCX_ACCEPTANCE_REPORT.md for reproduction and comparison.

DOCX EXTRACTION: Implemented local ZIP/OOXML reader using fflate and fast-xml-parser, loaded on demand. Reads document.xml, styles.xml and numbering.xml; retains paragraphs and line breaks, explicit/inherited heading levels, automatic numbering and manual heading text. Rejects corrupt/non-DOCX/XML/DTD input and bounded expansion. No backend or paid API.

STRUCTURED BLOCKS: ImportedLessonDocument now contains rawText plus ordered HEADING/PARAGRAPH/LIST/TABLE blocks and extraction warnings. DOCX analysis consumes blocks, not flattened rawText. Raw DOCX preview is read-only so edits cannot silently destroy table structure. The teacher edits extracted fields instead; “Dán kế hoạch khác” explicitly switches source. TXT/paste retain existing parsing behavior and also have source blocks.

TABLE EXTRACTION: Keeps rows/cells, original cell paragraphs/text, column positions, colspan and rowspan. Five actual GV/HS tables survive intact. Horizontal/vertical merges are covered by OOXML tests; orphan merges retain text with warning. Ambiguous merged headers/cells, unlabelled multicolumn tables and nested tables fall back to review. No claim of arbitrary Word layout reconstruction.

SECTION CLASSIFICATION: Contextual heading stack and boundaries, parent activity, table header and column associations. Separate lesson identity, outcomes, knowledge, competencies, qualities, preparation, teaching activity/stages, teacher/student activities, assessment, digital/AI and HSKT; OTHER retained. Preparation and unknown major sections end objectives. Goals/content/products/organization in activity tables stay in activities. Scores include explicit positive/negative signals; below 0.70 goes to review. A word such as “học sinh” or “AI” alone never creates an outcome or integration section. Future AiLessonAnalysisProvider remains interface-only.

REAL DOCX TEST: Candidate regression checks PASS for Giao_an_day_du_bang.docx and Giao_an_Tuan_2_Tich_hop_AI.docx found in Downloads; byte-identical local fixtures retained with hashes. The first was also uploaded/tested in the browser. **Exact original failure-file acceptance is PENDING:** the new attachment contains no DOCX and the user has not yet identified which local file reproduced the failure. Do not claim overall real-file acceptance PASS.

EXPECTED VS EXTRACTED: DOCX_ACCEPTANCE_REPORT.md contains field-by-field source comparison for both candidates. Table lesson: Tin học / 5 / Cấu trúc tuần tự, two knowledge items, three competencies, one quality, one explicit AI integration, five main GV/HS activities plus consolidation. Duration is unspecified periods and stays null. Paragraph lesson: Tin học / 3, not tuần 2; three knowledge, two competencies, one quality, six activities. When an outcome parent consists only of child knowledge/competency/quality sections, those lists are preserved separately with an explanatory UI note. Missing assessment/HSKT/digital sections remain empty. AI mentions embedded in other sections stay there, rather than being guessed into a separate list.

TEACHER CORRECTION: “Cần thầy/cô kiểm tra” provides “Đây là nội dung gì?” and all ten requested groups. Explicit transfer updates PedagogicalAnalysis, preserves source evidence, updates remaining item indexes, marks teacher edits and clears confirmation. Direct list edits/deletions invalidate stale correction mappings. All extracted instructional fields, including GV/HS/goals/products/organization, remain editable. Added explicit add/delete list controls. The DEV-only “Kiểm tra phân tích tài liệu” view shows source blocks/tables, category, destination field, score and scoring signals.

DEAD CONTROL AUDIT:

| Control | Verification |
|---|---|
| Dán nội dung / analyze | Browser coverage from Phase 2A retained; new interaction test runs paste → review |
| Nhập DOCX | Real browser chooser and interaction test; review has separate GV/HS fields |
| Nhập TXT | Existing import regression and new file-input interaction test |
| Phân tích lại | Browser replacement succeeds; cancellation preserves edits; interaction test verifies both |
| Quay lại / resume | Browser and interaction tests preserve teacher changes |
| Edit extracted fields | Metadata, qualities and GV text edited manually; all fields remain editable |
| Add/delete extracted item | Browser and interaction tests add and remove a quality item |
| Add/delete activity | Browser and interaction tests add/name/remove an activity |
| Correct uncertain content | Browser transfers OTHER; model tests cover all ten groups; interaction test verifies confirmation resets |
| Confirm | Disabled before checkbox, enabled after check, confirmation screen tested; no project generated |
| Cancel active analysis | Interaction test holds provider pending, cancels via visible button and verifies AbortSignal/late-result rejection; local browser pipeline completes too quickly for reliable manual cancellation |
| Cancel navigation/file read | Interaction test verifies late file results cannot overwrite input after navigation |
| Recent project recovery | Browser reopens existing eight-slide Phase 1 project; preview advances to 2/8; five projects remain; DOCX draft survives round trip |
| Future generation | Disabled action explicitly labelled “Sắp hỗ trợ”; PDF likewise labelled |
| Debug/source view | Expanded in browser; table structure and rule evidence inspected; screenshot saved |

TESTS: 236/236 PASS, verified by final npm test on 2026-10-07: 188 existing Phase 2A tests plus 48 corrective tests (43 structural/classification/correction, five interaction). No tests deleted; two old DOCX-unsupported assertions updated for actual DOCX support. All original 99 Phase 1 tests remain unchanged.

BUILD: TypeScript + Vite PASS. DOCX parser is a separate approximately 74 KB chunk; main bundle approximately 449 KB. Existing harmless Zod PURE-comment warnings remain.

MANUAL/DIAGNOSTICS: localhost http://127.0.0.1:5173/ remains running. scripts/diagnose-lesson.mjs writes source/blocks/analysis/classification/hash to ignored test-results/docx. Screenshot phase-2a-fix-table.png shows separate GV and HS columns. Historical Vite HMR errors during editing were resolved by restarting the workspace dev server and reloading; current import/review/editor/preview flow is functional.

KNOWN LIMITATIONS: Exact failing file not identified; teacher retest is required. Deterministic classification is not general semantic understanding. PDF/OCR, full page layout, arbitrary table nesting, complete list-number overrides and mathematical/text-box reconstruction are unsupported or warned. Nested/ambiguous table content is kept for correction, not silently assigned. DOCX capped at 2 MB and 200,000 extracted characters; expanded XML capped at 20 MB. Draft remains session-only and disappears on reload. TXT/paste still use the previously tested line rules, with less structural evidence than DOCX. npm audit reports pre-existing dev-tool vulnerabilities in Vitest/tinypool; no force upgrade was applied and no runtime parser advisory was reported.

STOP: Ready for the user to test the same DOCX again. Original-file acceptance stays pending until the correct file is identified and compared. No Phase 2B or push.
