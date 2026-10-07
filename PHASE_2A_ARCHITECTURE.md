# Phase 2A — Import and pedagogical review

## Corrective DOCX pass

DOCX now follows two stages: bounded local ZIP/OOXML extraction (`docx.ts`) → contextual pedagogical classification (`structure.ts`). Imported documents contain both `rawText` and ordered `LessonDocumentBlock[]`; raw text is a diagnostic projection, never the DOCX classifier input. TXT/paste retain their existing line rules and also carry source blocks. The future AI provider receives the same structured document model; no external AI is implemented.

The extractor retains explicit/inherited Word heading levels, paragraph text/breaks, list numbering and table rows/cells with column coordinates and horizontal/vertical spans. Manual numbered headings remain original paragraph text and are recognized semantically. Deleted tracked text is omitted; inserted text is retained. Numbering overrides, nested tables, images and orphan merges produce warnings. XML has a 20 MB expanded bound; DTD/entity declarations are rejected. DOCX packages are limited to 2 MB and extracted text to 200,000 characters. The parser chunk loads only when DOCX is chosen.

Classification uses heading hierarchy and section boundaries, parent activity context, table headers/coordinates and explicit metadata patterns. GV/HS columns stay distinct. Activity goals/content/products/organization are separate from lesson outcomes. Unknown major headings end previous sections; known preparation sections cannot leak into objectives. Unlabelled multicolumn or conflicting merged cells remain reviewable rather than being assigned to the previous heading. If objectives are expressed entirely as knowledge/competency/quality subsections, those lists remain separate; the UI explains the hierarchy.

Every DOCX classification has block ID, optional table coordinates, destination path, rule score and additive/penalty explanations. Below 0.70, content goes to teacher review; OTHER is always reviewed. Teachers can transfer uncertain content into a selected instructional group. Transfers retain source evidence, mark teacher edits and clear confirmation. Direct edits/deletions invalidate stale list mappings. The development-only debug view shows the original blocks and source → category → destination → signals.

Two real DOCX files found in Downloads are retained as regression fixtures, with provenance in `DOCX_ACCEPTANCE_REPORT.md`. Their identity as the user's original failing file is **unconfirmed**. The exact failure-file acceptance gate remains pending, even when regression tests pass.

## Data boundaries

`ImportedLessonDocument` retains source type, optional filename, raw UTF-8 text and import timestamp. `PedagogicalAnalysis` references its document ID and contains only extracted instructional fields, source traces and teacher edit markers. Neither is a canonical `LessonProject`; schema 2.2, migrations, storage, renderers and export remain unchanged.

The wizard keeps these two objects in memory for the session. Returning to the dashboard or opening a saved project retains the draft; page reload removes it. No document content is sent to a server or stored in existing projects.

## Deterministic provider

`LessonAnalysisProvider` exposes analysis, progress and cancellation. The local implementation scans headings and metadata, then processes outcomes, knowledge, competencies/qualities, activities, assessment/safety, and digital/AI/special-needs integration. Each actual stage reports start/completion and yields to the UI; there is no simulated AI delay. `AiLessonAnalysisProvider` is an interface only.

Heading matching normalizes Vietnamese accents, case and whitespace while preserving original source text. Common Roman/Arabic numbering and bullet variants are accepted. Wrapped lines join conservatively; unknown sections remain in unmapped content. Metadata conflicts retain the first value and report the competing source. Missing fields remain empty or null; curriculum grade and target audience grade are independent. Period counts are not converted to minutes.

Source traces retain field path, original text, line range and rule confidence. Confidence describes matching certainty, not pedagogical correctness. The teacher can inspect traces and edit every extracted field, including activities and unmapped content. Edits mark the affected field and clear confirmation. Reanalysis of edited content requires explicit replacement confirmation.

## Input and validation

Paste, TXT and DOCX are implemented. TXT requires valid UTF-8, at most 2 MB and 200,000 characters; BOM/CRLF are normalized. Empty, binary and malformed UTF-8 inputs fail with actionable Vietnamese messages. PDF remains a future format and is rejected honestly. Local DOCX extraction uses fflate and fast-xml-parser.

Zod validates document/analysis serialization and review updates. Missing subject/title/duration/outcomes/assessment, conflicting source metadata and grade mismatch produce nonblocking warnings. The review checkbox is mandatory before confirmation. Confirming does not create a canonical project.

## Future boundary

`LessonBlueprint` models stages, proposed slide types, purpose, learning goal, content, interaction, media intent, time and warnings; duplicate IDs and dangling stage references are rejected. `LessonGenerationProvider` declares blueprint creation and canonical project generation only. There is no implementation, API key, external AI call, slide generation or automatic editor handoff in Phase 2A.

## Verification and limits

The Vietnamese TXT fixture covers subject, grade, duration, outcomes, competencies, qualities, AI 4.B2.1, HSKT, five activities, assessment and unknown equipment content. Regression tests cover extraction variants, missing/conflicting inputs, provenance, cancellation, editing, confirmation, serialization and blueprint validation alongside all Phase 1 tests.

This is deterministic structural classification, not general semantic understanding or OCR. Unusual headings/layouts may require teacher correction. Complex table relationships fall back to review; nested tables retain text with a warning. Draft persistence, PDF extraction, AI analysis and blueprint/slide generation are deferred. No canonical schema/storage change was introduced.
## Phase 2A.2 architecture update

The current analyzer entry point is `LessonAnalysisService` in `src/import/analysisService.ts`. It prefers a configured `SemanticLessonAnalysisProvider`, validates unknown structured output against `src/import/semantic.ts`, normalizes into `PedagogicalAnalysis`, and falls back to local deterministic analysis. `LessonImportWizard` consumes service results and honest source status. The preceding sections describe the original Phase 2A and corrective implementation history; semantic analysis is now the intended primary intelligence, with local rules serving fallback and structural hints. Current confidence thresholds are 0.60 and 0.85, superseding the earlier 0.70 fallback threshold.

`buildSemanticAnalysisInput` preserves the entire ordered block/table representation and adds advisory structural hints. `aiAnalysisJsonSchema()` exposes the strict response contract for a future model adapter. Connections accept this structured input and return unknown output; no vendor SDK, backend, credential persistence or real AI request is implemented. Future personal preferences are provider ID, model and connection status only. Mock provider fixtures live exclusively under `tests/support` and are barred from production service mode.

See `PHASE_2A_2_CHECKPOINT.md` for confidence thresholds, validation, source badges, regression evidence and current limitations.
