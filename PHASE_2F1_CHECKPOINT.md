# Phase 2F.1 — Portable project backup and restore

Date: 2026-10-08. Implementation/checkpoint for teacher review. **Release acceptance is BLOCKED; do not treat this as a cross-browser PASS.** No commit or push.

## BRANCH / BASE COMMIT

- BRANCH: `feature/elearning-studio-phase-2f1`.
- BASE COMMIT: `926b4357a8fd1cbc36f963506427b050d8c402ba`.
- Verified baseline: Phase 2E branch, exact HEAD, clean working tree, tracking ahead/behind 0/0. Created only the requested Phase 2F.1 branch. Main unchanged.
- Prior baseline verification was 419/419 tests and build PASS; baseline investigation was not unnecessarily restarted.

## SKILLS USED

- `using-agent-skills`: workflow selection and explicit assumptions.
- `incremental-implementation`: manifest/binaries → secure restore → UI → acceptance, with focused checks between stages.
- `test-driven-development`: initial missing-module RED tests for collection and restore, regression RED for unreferenced generator suggestions, RED/GREEN download-link UI test.
- `api-and-interface-design`: canonical LessonProject, typed media reader/writer boundaries, optional atomic insert capability on ProjectStore.
- `frontend-ui-engineering`: existing Dashboard/Editor integration, Vietnamese progress/errors, native confirmation dialog, explicit download link.
- `code-review-and-quality`: final diff review and mutation experiment: temporarily removing duplicate-entry rejection made its regression test fail; the guard was restored before final checks.
- `git-workflow-and-versioning`: isolated requested branch, preserve all data, no staging/commit/push.
- `security-and-hardening`: untrusted ZIP/JSON/media boundary, allowlists, integrity/size checks and insert-only persistence.

Installed skills inspected. `browser-testing-with-devtools` is not installed; Chrome DevTools MCP unavailable. Existing CUA in-app browser used. No skills installed, overwritten or removed.

## BACKUP FORMAT

ZIP format identifier `E_LEARNING_STUDIO_BACKUP`, version **1**, application version `0.0.0` (current package version), canonical schema **2.2**.

```
e-learning-backup.zip
  manifest.json
  project.json
  assets/0001.jpg
  assets/0002.png
  ...
```

Version 1 uses ZIP **STORE (method 0, no compression)**. This is deliberate: restore never inflates attacker-supplied streams. ZIP64, compression, encryption, data descriptors, extra fields, comments, multi-disk ZIPs, symlinks and directory entries are unsupported and rejected. Archives repacked by arbitrary ZIP utilities may therefore be rejected; preserve the app-created ZIP unchanged.

Manifest contains format/version/application/schema version, original project ID/title, UTC creation time, project file size/SHA-256, and an inventory of asset ID, safe package path, MIME, byte size, SHA-256 and source/license/creator/attribution metadata.

`unattachedSuggestions` explicitly lists unreferenced, empty LIBRARY/EXTERNAL image suggestions produced by the existing generator. They remain unchanged in project.json; they are not missing image files. A referenced empty suggestion is blocked. No incomplete-backup export option exists.

## ASSET INVENTORY / CHECKSUMS

- Collects all actual local image records in the canonical project, including unreferenced local images, once per stable asset ID. Multiple slides sharing one asset do not duplicate its file.
- Fetches real Blob bytes from the existing project-scoped Phase 2D media store. Preserves original canonical project assets/slides/settings without rebuilding a lesson.
- Preserves PNG/JPEG/WebP, alt text, captions, source/license metadata, teacher edits, narration text/transcripts, layouts, themes, objectives, ordering, stages, quiz answers and scenario feedback.
- Missing records block export with Vietnamese slide/asset identification. Ownership, MIME, stored size and canonical size are cross-checked. External images, AUDIO/VIDEO and AUDIO_ASSET narration are blocked rather than silently omitted.
- SHA-256 covers exact UTF-8 project.json bytes and every image file. ZIP CRC32 also covers every entry. Restore checks both, inventory completeness/uniqueness and manifest/project identity/title/schema consistency before persistence.
- Checksums detect corruption; they do not authenticate the author. Backups are unencrypted and should be handled as teacher documents.

## ZIP SECURITY / RESTORE VALIDATION

Limits (binary MiB): archive ≤80 MiB; total entry payload ≤72 MiB; each JSON ≤2 MiB; each image ≤8 MiB; ≤128 canonical asset records and ≤130 ZIP entries. Raw ZIP bytes are size-checked before structure/JSON parsing. No decompression is performed.

Strict central/local header agreement, contiguous offsets, end-directory consistency, file count, CRC32, exact allowed names and entry uniqueness are checked before JSON parsing. Paths are only manifest.json, project.json and assets/NNNN.png|jpg|webp: traversal, absolute/device paths, backslashes, unexpected nested files and script extensions are rejected. Files never extract to filesystem paths or execute.

Manifest is a strict bounded Zod schema; project uses the existing canonical schema 2.2. Metadata is displayed through React escaping. Source/license URLs must be credential-free HTTPS (or empty); no remote media fetching occurs during restore. Common credential fields, key patterns, bearer/private-key patterns, temporary blob/file URLs and device paths are rejected rather than silently removed. Browser AI configuration, cookies, environment files and student sessions are never read into the archive. This is not a claim of exhaustive secret detection in arbitrary teacher prose.

Raster validation reuses Phase 2D MIME/magic-byte checks and rejects SVG. It is not a complete image decoder or antivirus scan. Automated controlled raster fixtures include short signature bytes; jsdom cannot prove real image decoding. Real restored-image decoding remains part of blocked browser acceptance.

## CONFLICT HANDLING / ROLLBACK

Restore always creates a new UUID project ID, even without a conflict. Keeps original title, createdAt, slide IDs, stable asset IDs and local-media references; updates project ownership on binary records and updatedAt. Existing project remains untouched. No overwrite UI.

ProjectStore gains optional `saveNew` capability implemented with IndexedDB `add`, and media store gains `addNew`. Both are transaction-completion based and reject collisions rather than overwriting. LocalStorage fallback restore is disabled because it lacks the required insert-only IndexedDB capability; existing editing/JSON behavior remains intact.

Validation completes before writes. Restore revalidates original bytes after teacher confirmation, imports all binaries first, and saves the project last. On an ordinary storage failure, removes only binaries successfully inserted for the new project. Cleanup failure reports possible unused image records honestly; it does not create a visible partial project.

**Transaction limitation:** project and media use separate existing IndexedDB databases, so no cross-database atomic transaction exists. A browser crash during restore can leave orphan binaries without a visible project. There is no startup orphan sweeper in this phase. Store implementations must honor saveNew's commit/abort semantics; arbitrary stores that commit and then throw cannot provide this guarantee.

## DASHBOARD/EDITOR UI

- Editor: “Sao lưu bài giảng” → “Đang đóng gói hình ảnh…” → explicit “Tải bản sao lưu ZIP” link. Uses the current edited canonical snapshot; no requirement to reconstruct from the generator or AI. Link Blob URL is ephemeral UI-only and revoked when replaced/unmounted, never stored in the archive.
- Dashboard: “Khôi phục bài giảng” → ZIP inspection → native dialog with title, slide/image counts, duration and conflict notice → “Khôi phục thành bản sao”. Cancel performs no persistence. Success displays “Khôi phục thành công” and “Mở bài giảng đã khôi phục”.
- Progress/error states are Vietnamese; JSON validation diagnostics are not presented as a technical editor flow. Existing JSON import/export remains available and backward-compatible.

## CROSS-BROWSER ACCEPTANCE — BLOCKED (release-blocking)

Real application target: existing 12-slide “Thu thập và tìm kiếm thông tin — Kiểm thử Phase 2D”, project `c2e571a2-a52f-4b2c-8c12-c3d7ceb7626e`, 4 local images (3 Commons + 1 upload) and 3 unattached generator suggestions, including scenario 5.A1.1.

Observed in the actual existing browser:

- Backup UI reached “Tệp đã sẵn sàng” with a real application-created Blob ZIP download link; no missing-binary warning after explicit suggestion handling.
- Attempts to capture the download via `waitForEvent('download')` timed out (20s/15s). The supported link `downloadMedia` also timed out after 20s. No downloaded file path was obtained. Therefore **disk ZIP inspection and real UI restore are not claimed PASS**.
- Browser inventory exposes only Codex In-app Browser and MCP Apps. Advertised browser capabilities are visibility/viewport; no independent profile/storage-context creation API is exposed. A new same-profile tab would not satisfy acceptance. No storage clearing, hidden-state injection or alternate browser automation was used.
- UI JSON export before/after confirmed the original project, all 12 slides and 4 local image records unchanged. Dashboard still contains its original 8 projects. No teacher project was overwritten or deleted.
- Dashboard restore button is visible. Console warning/error snapshot was empty.

Evidence (ignored, not intended for staging): `test-results/phase2f1/backup-ready.jpg`, `test-results/phase2f1/dashboard-restore.jpg`. The former is a narrow in-app authoring viewport and illustrates the ready download control, not a mobile-layout certification or completed download.

Required teacher/manual follow-up: download the ZIP in a browser that supports local file downloads; inspect manifest/project/4 real binaries; restore through Dashboard in a separate fresh browser/profile; verify image decoding/attribution, scenario, quiz, edit/save, refresh/reopen. Until this is completed, Phase 2F.1 is **not release-accepted**.

## MEDIA PERSISTENCE / QUIZ/SCENARIO PRESERVATION

**Automated PASS:** separate fake-indexeddb databases prove binary restoration/ownership remapping, project save/reopen, stable references, exact slides/layouts/manual text/settings/quiz/scenario data, existing-project conflict safety, partial-media/project-save rollback and honest cleanup-failure reporting. An integration test resolves the restored binary through unchanged StudentPreview/SlideCanvas and preserves caption text.

**Real browser PENDING/BLOCKED:** image decoding, attribution and quiz/scenario execution after ZIP restore, edited-copy refresh/reopen and independent-browser portability. Automated database isolation is not substituted for these release-blocking checks.

## BASELINE TESTS / NEW TESTS / TOTAL TESTS / BUILD / DIFF CHECK

- BASELINE TESTS: 419 retained unchanged, PASS in the full run.
- NEW TESTS: 43 across five new test files (11 backup, 22 ZIP/security, 7 restore/storage, 2 UI, 1 rendering).
- TOTAL TESTS: 462/462 PASS, 32 files (final run 14:02:16, 12.87s).
- BUILD: PASS, 1793 modules. Main bundle 574.62 kB, gzip 179.99 kB. Existing non-fatal Zod PURE annotation and >500kB bundle warnings remain.
- DIFF CHECK: PASS (`git diff --check`).
- Tests/build used approved outside-sandbox execution due the previously confirmed esbuild ancestor-scan access restriction. No recursive permission changes or Vite configuration workaround.
- No baseline tests weakened, removed or skipped in the full suite. Mutation run intentionally selected one test and failed as expected; production guard restored immediately. Initial TDD/type-check failures were corrected, not suppressed.

## KNOWN LIMITATIONS / DEFERRED

Release-blocking download/independent-context acceptance is unresolved as detailed above. Raster validation checks signatures rather than full decoding. STORE-only ZIPs may be larger, must fit memory and have strict limits. Audio/video/external-image packages and fallback LocalStorage restore are unsupported. No compressed/ZIP64/repacked ZIP compatibility. No source authentication/encryption or universal secret scanner. Separate-database crash/orphan limitations remain. Existing Phase 2E internal slide scrolling, desktop-first Editor, source/relevance review and time-budget limitations are unchanged.

DEFERRED: SCORM 1.2, offline HTML player ZIP, cloud sync, accounts, billing, AI images/providers, new narration/TTS and Phase 2F.2. No commit, push, merge, reset, rebase, force-push or main changes.

## Exact intended changed files

Modified: `src/Dashboard.tsx`, `src/editor/Editor.tsx`, `src/media/storage.ts`, `src/storage/projects.ts`.

New: `src/backup/BackupButton.tsx`, `src/backup/RestoreControl.tsx`, `src/backup/backup.css`, `src/backup/package.ts`, `src/backup/restore.ts`, `src/backup/zip.ts`, `tests/fixtures/backup.ts`, `tests/phase2f1-backup.test.ts`, `tests/phase2f1-security.test.ts`, `tests/phase2f1-restore.test.ts`, `tests/phase2f1-ui.test.tsx`, `tests/phase2f1-rendering.test.tsx`, `PHASE_2F1_CHECKPOINT.md`.

No package/dependency/lockfile, `.env`, credentials, node_modules, generated screenshots/ZIPs, or unrelated source changes. Work remains unstaged and uncommitted for teacher review.

## End-of-day publication authorization — 2026-10-08

Teacher authorized a separate Git checkpoint and normal push for this branch.
Fresh approved outside-sandbox verification: 462/462 tests PASS (32 files), npm run build PASS, git diff --check PASS.
Review excludes private test-fixtures/TUẦN 5.docx, teacher/browser data, screenshots, temporary/generated files and credentials. The tracked .env.example contains an empty API-key placeholder only.
This supersedes the earlier no-commit/no-push review hold; it does not change acceptance status.
Cross-browser real ZIP export/import and media/edit persistence acceptance remains BLOCKED/PENDING. Controlled tests are not independent-browser acceptance. Phase 2G changes are not integrated here.
