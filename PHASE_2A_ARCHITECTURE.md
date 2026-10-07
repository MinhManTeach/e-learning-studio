# Phase 2A — Import and pedagogical review

## Data boundaries

`ImportedLessonDocument` retains source type, optional filename, raw UTF-8 text and import timestamp. `PedagogicalAnalysis` references its document ID and contains only extracted instructional fields, source traces and teacher edit markers. Neither is a canonical `LessonProject`; schema 2.2, migrations, storage, renderers and export remain unchanged.

The wizard keeps these two objects in memory for the session. Returning to the dashboard or opening a saved project retains the draft; page reload removes it. No document content is sent to a server or stored in existing projects.

## Deterministic provider

`LessonAnalysisProvider` exposes analysis, progress and cancellation. The local implementation scans headings and metadata, then processes outcomes, knowledge, competencies/qualities, activities, assessment/safety, and digital/AI/special-needs integration. Each actual stage reports start/completion and yields to the UI; there is no simulated AI delay. `AiLessonAnalysisProvider` is an interface only.

Heading matching normalizes Vietnamese accents, case and whitespace while preserving original source text. Common Roman/Arabic numbering and bullet variants are accepted. Wrapped lines join conservatively; unknown sections remain in unmapped content. Metadata conflicts retain the first value and report the competing source. Missing fields remain empty or null; curriculum grade and target audience grade are independent. Period counts are not converted to minutes.

Source traces retain field path, original text, line range and rule confidence. Confidence describes matching certainty, not pedagogical correctness. The teacher can inspect traces and edit every extracted field, including activities and unmapped content. Edits mark the affected field and clear confirmation. Reanalysis of edited content requires explicit replacement confirmation.

## Input and validation

Paste and TXT are implemented. TXT requires valid UTF-8, at most 2 MB and 200,000 characters; BOM/CRLF are normalized. Empty, binary and malformed UTF-8 inputs fail with actionable Vietnamese messages. DOCX/PDF are declared future formats and rejected honestly; no dependency or extraction claim is made for them.

Zod validates document/analysis serialization and review updates. Missing subject/title/duration/outcomes/assessment, conflicting source metadata and grade mismatch produce nonblocking warnings. The review checkbox is mandatory before confirmation. Confirming does not create a canonical project.

## Future boundary

`LessonBlueprint` models stages, proposed slide types, purpose, learning goal, content, interaction, media intent, time and warnings; duplicate IDs and dangling stage references are rejected. `LessonGenerationProvider` declares blueprint creation and canonical project generation only. There is no implementation, API key, external AI call, slide generation or automatic editor handoff in Phase 2A.

## Verification and limits

The Vietnamese TXT fixture covers subject, grade, duration, outcomes, competencies, qualities, AI 4.B2.1, HSKT, five activities, assessment and unknown equipment content. Regression tests cover extraction variants, missing/conflicting inputs, provenance, cancellation, editing, confirmation, serialization and blueprint validation alongside all Phase 1 tests.

This is heading-based extraction, not semantic understanding, OCR or table reconstruction. Unusual headings/layouts may require teacher correction. Draft persistence, DOCX/PDF extraction, AI analysis and blueprint/slide generation are deferred.
