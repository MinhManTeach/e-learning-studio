# Phase 2G.2 — DOCX embedded media extraction and reuse

STATUS: Ready for teacher review; local uncommitted implementation.
DATE: 2026-10-08 (Asia/Bangkok).
BRANCH: feature/elearning-studio-phase-2g2
BASE COMMIT / CURRENT HEAD: 054272464d459534a80fd0e900c7ed61fe369f27
WORKTREE: C:/Users/user/.codex/worktrees/elearning-phase-2g1/App Elearning cho GV

## Git safety

PASS: Started from the requested clean Phase 2G.1 baseline and created the requested Phase 2G.2 branch in the same isolated worktree. No commit, push, merge, reset, clean, stash or rebase. Nothing staged. The original Phase 2F.1 checkout was not modified; its private DOCX was read solely for acceptance. No teacher projects on the existing 5173 origin were modified. Browser acceptance used a new 5174 origin, initially showing zero projects.

SKILLS USED: incremental-implementation; test-driven-development; api-and-interface-design; frontend-ui-engineering; code-review-and-quality. No Skills installed or modified.

## Extraction and relationship mapping

PASS: DOCX import returns separate referenced image binaries and ordered image placements. An unused ZIP media inventory file does not become a placement. Repeated placements retain separate provenance while sharing the source binary. DrawingML and VML relationships are supported, and AlternateContent fallback representations are not counted twice.

Each placement retains relationship ID, media reference/status, source block/order, table row/column, paragraph index (including empty image paragraphs), image order, original alt text, nearby text and a nearby caption when present. Horizontal and vertical merged-cell regressions pass. External/unsafe targets are never fetched. Missing/unsupported images retain placement provenance and produce explicit extraction warnings.

MIME signatures must match declared PNG/JPEG/WebP types. Import remains bounded by 2 MB compressed input, 20 MiB selected expanded content, 128 placements, 8 MiB per image and browser decoding limited to 24 million pixels when createImageBitmap is available. Unsupported formats remain review warnings rather than silently substituted images.

## Exact seven-image acceptance

PASS: The exact private test-fixtures/TUẦN 5.docx was run through importPlanFile and DeterministicLessonAnalysisProvider, and then through the real application upload/analyze/review/blueprint/generation workflow. No substitute DOCX or fabricated project was used.

Document SHA-256: 48ae17e9acdff3a9e07cd91a5ee34c7c499e76a011fde382b9dab3605b71847b
Final pipeline result: 7 referenced binaries; 7 distinct binary checksums; 7 VALID placements; original image order preserved. All seven decoded in the real browser source gallery. Five activities remain ordered with 5–17–5–5–3 minutes, total 35; subdivisions remain 9 + 8 minutes.

All placements below belong to block-24. Row, column and paragraph indices are zero-based; column 0 is the teacher column. Image descriptions are acceptance labels supplied by the teacher, not inferred filenames.

| Image | Relationship | Row | Column | Paragraph | Source activity |
| --- | --- | --- | --- | --- | --- |
| 1. Numbered desktop diagram | rId6 | 5 | 0 | 2 | Knowledge formation, desktop section (9 min) |
| 2. Speaker illustration | rId7 | 5 | 0 | 14 | Knowledge formation, desktop section (9 min) |
| 3. Laptop image | rId8 | 7 | 0 | 1 | Knowledge formation, other computers (8 min) |
| 4. Numbered laptop diagram | rId9 | 7 | 0 | 3 | Knowledge formation, other computers (8 min) |
| 5. Touchpad illustration | rId10 | 7 | 0 | 9 | Knowledge formation, other computers (8 min) |
| 6. Touchscreen illustration | rId11 | 7 | 0 | 12 | Knowledge formation, other computers (8 min) |
| 7. Component/function matching | rId12 | 9 | 0 | 2 | Practice (5 min) |

No image was lost or replaced with an unrelated Wikimedia result during acceptance.

## Binary storage and source-first workflow

PASS: Normal generation prepares source assets before saving the project, using the existing Phase 2D LocalMediaAssetStore. SHA-256 asset IDs deduplicate identical binaries within the project; all original placements remain available. Binaries stay in IndexedDB, never base64 in LessonProject JSON. JSON retains asset references, checksum, placement provenance and source attribution.

Preparation failure or project-save failure invokes project-scoped rollback of newly collected binaries; preexisting binaries are preserved. Synthetic tests verify this behavior. The preparation callback and binary collection are excluded from the generation-provider transport boundary; semantic-provider inputs contain structural text, not media bytes.

PASS: Existing MediaPanel shows source images before Wikimedia. Candidate ranking prefers an exact source-cell match, then a confirmed activity-boundary match, then nearby-text overlap; filename is not a semantic signal. Paraphrased generated slides can retain activity provenance through an unchanged source activity title. Ambiguous candidates remain explicitly subject to teacher review.

Teacher approval is required to attach source images. Wikimedia remains disabled until the teacher explicitly marks source images unsuitable; projects without source assets retain the existing search workflow. Existing selected media is replaced only after explicit selection, never automatically. Manual upload remains available.

LICENSE: USER_PROVIDED_UNVERIFIED. Attribution explicitly states that images came from the teacher's KHBD and that reuse rights are unverified. Source alt text/captions are retained; the teacher can provide a better alt description when attaching.

## Editor, Student Preview and persistence

PASS — Real browser, 127.0.0.1:5174:

1. Imported the exact DOCX through the visible file chooser.
2. Reviewed analysis, entered Tin học and target learner grade 3 explicitly; no source curriculum grade was invented.
3. Approved the existing blueprint and used the actual generator, producing a separate 35-slide lesson.
4. Reviewed the seven decoded source thumbnails and attached three actual source images with descriptive teacher-reviewed alt text: desktop diagram to slide 4, touchscreen to slide 5, matching exercise to slide 24.
5. Verified all three decode in the existing Editor and Student Preview.
6. Saved, refreshed to Dashboard, reopened the project and rechecked all three in BOTH Editor and Student Preview.
7. Decoded intrinsic widths after reopen: 299 px (desktop), 266 px (touchscreen), 443 px (matching). These are real image dimensions, not mock URLs.
8. Browser console inspection at acceptance returned no errors or warnings.

PASS with readability limitation: matching-image Student Preview at 390 × 844 viewport still decoded, rendered about 320 px wide and stayed within the layout. Viewport override was reset. Existing 16:9 layout/CSS was retained. Internal slide scrolling and small text inside source illustrations remain limitations, not a claim of full mobile readability.

Screenshot evidence remains OUTSIDE Git in the local Codex visualizations directory:
- phase2g2-source-preview.jpg (desktop; also shows long-title/internal-scroll limitation)
- phase2g2-matching-preview.jpg (matching image in Student Preview after reopen)

## Automated verification

BASELINE TESTS: 437 preserved.
NEW TESTS: 23 (11 extraction; 6 association/storage/ranking; 3 UI; 3 generation/transport/rollback).
TOTAL TESTS: 460/460 PASS across 34 files.
BUILD: PASS (TypeScript + Vite).
DIFF CHECK: PASS.
REVIEW: Intended source/tests inspected. No secret patterns, private DOCX, .env, node_modules, screenshots or temporary/generated files in the changed-file inventory. Staging remains empty.
MUTATION CHECK: Inverting MIME comparison caused extraction tests to fail as expected; exact original source restored, focused tests rerun PASS before final all-tests/build verification.

Build warnings remain nonfatal: existing Zod annotation warnings and the main bundle exceeding 500 kB (about 559 kB minified). Git may report LF-to-CRLF normalization notices; diff check reports no whitespace errors.

## Known limitations and pending checks

- PENDING: physical disconnected-network/offline-device acceptance; not claimed PASS. UI fallback is covered by controlled tests; no live Wikimedia search was needed or performed in this acceptance because suitable DOCX images were available.
- Source association is structural and conservative, not visual AI recognition. If an activity title is edited or source alignment is ambiguous, the gallery requires teacher review. A cell can contain several images, so a cell match does not prove the exact intended illustration. All source candidates remain accessible.
- Existing generation still creates 35 slides for this document and can produce fragmented student-answer pages or expose suggested answers. This was observed in the real workflow and deliberately not changed here; question/answer intelligence and generation refinement remain outside 2G.2.
- Word's original auto-generated English alt text can be poor; it is preserved for provenance, not treated as verified accessibility text. The three accepted attachments used explicit Vietnamese alt text.
- Low-resolution illustrations, long generated titles, internal scrolling and small mobile image text remain visible. No claim that these layouts are fully readable on all mobile devices.
- Extraction is limited to document-body paragraphs and direct table-cell paragraphs. Header/footer, footnote, floating-layout reconstruction and nested-table image placements are not fully supported. Existing complex-table warnings remain; unusual layouts require source review.
- Only supported raster image binaries are reusable. SVG/EMF/WMF and external image links are reported as unsupported, not fetched or converted. No OCR, image generation or automatically verified source license.
- Browser acceptance validates same-browser save/refresh/reopen on an isolated origin, not portable backup or cross-device restore. Original Phase 2F.1 changes were not imported into this worktree.

## Exact changed files

- PHASE_2G2_CHECKPOINT.md
- src/generation/model.ts
- src/generation/service.ts
- src/import/LessonImportWizard.tsx
- src/import/documents.ts
- src/import/docx.ts
- src/import/mediaModel.ts
- src/import/model.ts
- src/media/MediaPanel.tsx
- src/media/SourceImageCandidate.tsx
- src/media/docx.ts
- src/media/model.ts
- src/media/storage.ts
- src/model/schema.ts
- tests/fixtures/docxMedia.ts
- tests/phase2g2-extraction.test.ts
- tests/phase2g2-generation.test.ts
- tests/phase2g2-source.test.ts
- tests/phase2g2-workflow.test.tsx

STOP: No commit or push. Await teacher review. Phase 2G.3/2G.4 not started.

## End-of-day publication authorization — 2026-10-08

Teacher authorized a separate Git checkpoint and normal push for this branch.
Fresh approved outside-sandbox verification: 460/460 tests PASS (34 files), npm run build PASS, git diff --check PASS.
Private DOCX, teacher/browser data, screenshots, temporary/generated files and credentials remain outside this commit. The tracked .env.example contains an empty API-key placeholder only.
This supersedes the earlier no-commit/no-push review hold. Browser evidence and limitations above remain unchanged.
Resume diagnostic: new lesson UI displayed learner grade 35 (unconfirmed), four activities, 116 review items and no assessment evidence. Exact new DOCX is unavailable, so its actual structure and the origin of 35 remain unconfirmed. Grade metadata/form validation accepts arbitrary strings; review-item count is not a count of independent parser errors. Real AI provider is not configured.
Phase 2F.1 portable ZIP backup is on a separate branch and is not integrated here; independent-browser ZIP acceptance remains pending there. GitHub does not synchronize IndexedDB projects or image binaries.
