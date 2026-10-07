PHASE 1 CHECKPOINT

BRANCH:
feature/elearning-studio-phase-1

COMMIT:
The single implementation commit containing this checkpoint. Resolve with `git log -1 --format=%H -- PHASE_1_CHECKPOINT.md`; the hash is also reported in the delivery message. A commit cannot contain its own final hash.

MESSAGE:
feat: build core slide and template system

BASELINE TESTS:
51/51 PASS before implementation at eceae56; baseline production build PASS. All 51 tests retained and passing. Legitimate schema21 assertions now expect 2.2 at the public decoder boundary; frozen 2.1 factories construct old fixtures; preservation assertions compare meaningful original content while allowing new default fields. No baseline tests deleted.

TOTAL TESTS:
99/99 PASS (51 baseline + 48 Phase 1), 4 test files. Final run 2026-10-07.

BUILD:
PASS — TypeScript and Vite production build. Two existing Zod comment-annotation warnings, no build errors. Main JS 397.52 kB / gzip 120.43 kB.

SCHEMA:
2.2

MIGRATION:
1.x/2.0 use frozen existing migration to 2.1, then deterministic 2.1 → 2.2. Preserve project identity/timestamps, slide IDs/order/content, assets, metadata/objectives/settings, source payloads and unsupported legacy data. Old image URLs become stable asset references. Legacy pages remain compatibility placeholders when no reliable interactive mapping exists.

IMPLEMENTED:
Canonical schema and validation; one registry; type-specific editors and factories; shared layouts/renderers; density and grade warnings; lesson settings/themes; media references; narration/accessibility fields; separate student session; progress/completion; weighted quiz; JSON import/export; 14-slide fixture and documentation. Existing storage, save recovery and LmsAdapter boundaries retained. No AI/SCORM/media upload pipeline.

SLIDE TYPES:
welcome, objectives, content, warmup, scenario, quiz, summary, completion. Existing legacy type retained. Future type names reserved only.

LAYOUT SYSTEM:
TEXT_ONLY, TEXT_LEFT_MEDIA_RIGHT, MEDIA_LEFT_TEXT_RIGHT, MEDIA_FULL, CENTERED. Shared SlideCanvas in editor and player. Disabled media has no image/figure/media column; media layouts render TEXT_ONLY. 16:9 stage with internal overflow for dense content. SAFE_TEAL/NAVY/FOCUS_DARK tokens centralized.

INTERACTIONS:
Warmup immediate feedback and session reset. Scenario 2–4 editable choices, recommendation text/symbol, feedback/consequence and permitted retry; formative activities do not affect final quiz score.

QUIZ ENGINE:
Three levels; weighted earned/available points normalized to 0–100; pass threshold; review/correct answers/explanations; attempt history; lesson retry and attempt limits; deterministic question/answer shuffle. Unanswered/invalid indices/zero questions/zero points safe. Completion sums points across quiz slides. Required-slide completion checks actual visits independently of rounded display percentage.

RUNTIME STATE:
LessonSessionState contains navigation, visited IDs, formative selections and quiz attempts. Never serialized into authoring project, storage or JSON export. Restart creates a new session. Progress counts unique valid visited IDs.

ASSET ARCHITECTURE:
AssetReference supports IMAGE/AUDIO/VIDEO, sourceType, metadata/status and alt text. Slides reference assetId. URL image editing preserved; shared assets copied on media edit to protect duplicated source slides. HTTP(S) image failures handled safely. No blobs/uploads/download bundling introduced.

JSON ROUND-TRIP:
PASS automated and browser. The current edited canonical LessonProject is the single source of truth for export. In browser, changed welcome title, exported visible JSON, saved exact text as a local test file, imported that file through the chooser, accepted replacement of the same test project ID, then re-exported: byte-for-byte identical JSON. Runtime absent. Export dialog offers selectable text and file download. Canonical example: examples/lesson-2.2.json.

ACCESSIBILITY:
Keyboard navigation and native radio semantics, visible focus, labeled controls, textual feedback independent of color, image alt fallback, fontScale 1–2 and high contrast. Teacher notes omitted in preview. Browser TTS start/stop verified; audible voice quality depends on installed voices. Captions/transcript/reduced-motion fields prepared, multimedia playback deferred.

MANUAL TEST:
PASS for implemented workflows, with the download-tool limitation below recorded explicitly.
- Old saved 2.1 five-slide project opens with schema 2.2, grades 4/4 and content/order intact.
- Sample schema 2.2, curriculumGrade 4, targetAudienceGrade 5, 35 minutes; visible mismatch warning.
- Created a separate test lesson with all eight types; renamed completion, duplicated, reordered, deleted the test duplicate, saved, refreshed and reopened: eight pages and renamed title retained.
- Content TEXT_LEFT_MEDIA_RIGHT with local HTTP image; disabled media: no img/figure and no media column.
- Warmup wrong-choice feedback appears immediately; restart clears selections.
- Scenario wrong choice shows feedback/consequence; retry enables recommended B.
- Both five-question quizzes submitted correctly, 100/100, threshold 80, review answers/explanations visible; retry clears answers and increments attempt. All 14 slides visited: 100% progress and PASSED/Đạt yêu cầu completion.
- Keyboard arrow from content changes page; previous/next work. TTS changes to Dừng đọc, cancels on restart/navigation.
- SAFE_TEAL, NAVY and FOCUS_DARK shared renderer verified; NAVY and FOCUS_DARK preview reflect settings.
- Font scale 1.5 and high contrast applied in preview; no horizontal stage overflow on the tested welcome slide.
- 1366×768 stage measured 1045×587.8125; 1920×1080 stage measured 1060×596.25: both 16:9. Smaller screen may need normal vertical page scroll to reach navigation.
- Canonical JSON chooser import and exact round-trip verified as described above. No blocking browser console errors captured.
- 50 slides / 100 quiz questions validation and round-trip covered in tests; no formal latency benchmark claimed.

FILES CREATED:
SCHEMA_2_2.md; PHASE_1_CHECKPOINT.md; examples/lesson-2.2.json; phase-1-preview.png;
src/model/{schemaV21,factoriesV21,migrationsV21,analysis,json}.ts;
src/slides/{defaults.ts,registry.tsx}; src/fixtures/sampleLesson.ts;
src/editor/{Controls,QuizEditor,SlideProperties,TypeSpecificEditor}.tsx;
src/player/{session.ts,SessionContext.tsx};
src/renderers/{StaticRenderers,InteractionRenderers}.tsx;
src/lesson-themes.css; tests/phase1.test.tsx.

FILES MODIFIED:
README.md; src/Dashboard.tsx; src/main.tsx;
src/model/{schema,schemaV20,factories,migrations}.ts;
src/editor/{Editor,Properties,SlideList}.tsx; src/editor/reducer.ts;
src/player/StudentPreview.tsx; src/renderers/SlideCanvas.tsx;
tests/schema21.test.ts. Reference files and Phase 0 historical checkpoint/schema documentation unchanged.

KNOWN ISSUES:
- The in-app browser download observer timed out for Blob downloads. Direct file-download completion remains unverified in this embedded browser; the selectable JSON export fallback and file-chooser round-trip passed. No claim that a downloaded file was observed.
- Browser TTS voice availability and quality are device dependent; no audio quality assessment claimed.
- Legacy interactions are preserved as legacy data rather than automatically guessed into new interaction payloads.
- Uploaded/local/bundled media and AUDIO_ASSET playback are architecture only in Phase 1. Dense quiz pages intentionally scroll inside the stage; density warnings are advisory.

DEFERRED:
- Full Media Library
- Microphone recording
- Uploaded audio/video
- AI TTS
- Lesson-plan import
- AI Analyzer
- AI lesson generation
- SCORM 1.2 ZIP
- HTML5 Offline ZIP
- Certificate generation
- Cloud sync
- Authentication
- Collaboration
- Payments

NEXT RECOMMENDED PHASE:
Phase 2 — Media Library & Rich Multimedia
