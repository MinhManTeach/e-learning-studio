# Reference implementation review

The four supplied files are copied byte-for-byte into `reference/`. Originals in Downloads are unchanged.

## Data and rendering

`lesson_data.json` declares version 1.2.0 with metadata, nested objectives, and 14 ordered slides. Common slide properties include stable IDs, step grouping, titles, subtitles, voice scripts, notes and type-specific payloads. Welcome/content use bulletPoints, keyTakeaway and media fields. Other types: warmup, hyperlink_demo, scenario, quiz, mindmap and certificate.

`index.html` embeds a full LESSON object rather than fetching JSON, permitting direct file launch. A single renderSlide function builds each slide with string concatenation and innerHTML. Navigation clamps indexes and updates buttons and step badges; keyboard left/right navigate globally. Warmup reveals feedback, hyperlink demo simulates navigation locally, scenarios reveal feedback and consequences for choices. Quiz stores selected answer indexes, calculates rounded percent across six questions, displays explanations and uses 80 as a hardcoded pass threshold even though quizData also has passingScore. Quiz results remain in memory only.

## Voice and LMS

Web Speech API reads voiceScript with title fallback, vi-VN, rate 0.95. The device/browser provides voices; availability offline is not guaranteed.

`scorm_api.js` discovers SCORM 1.2 API in parent/opener, initializes, commits score/status/suspend_data, and finishes on beforeunload. Each navigation stores the numeric slide index. The HTML reads suspend_data but ends with renderSlide(0), discarding the restored index. Score submission reports raw/max/min and passed/failed; the wrapper checks minScore by truthiness, so minimum 0 is not written. Clicking completion sets completed, potentially overriding passed/failed. Parent traversal has no cross-origin exception guard. These are recorded for future player/adapter work; the original helper has not been changed.

## Offline

README claims complete offline behavior, but the HTML references Google Fonts, Tailwind CDN and remote Unsplash images. Embedded lesson data and JS interactions work without JSON fetch; cached style/assets are not an offline guarantee. The new shell uses local bundled CSS/JS and system fonts. Future export must bundle media and player assets and test disconnected operation separately.

## Migration choice

Schema 2.0 separates common slide properties from discriminated type-specific data. Legacy welcome/content map to basic slides; other types use an explicit legacy placeholder retaining their entire original payload. The complete source object is also retained in legacySource, including metadata extensions, quiz answers, explanations, scenario feedback, original media descriptors and version. IDs are preserved when valid and unique; duplicates receive generated IDs. New projects have independent generated IDs. Unsupported newer versions and malformed projects are rejected rather than silently rewritten. Saved invalid records are skipped with a visible count, left in storage untouched.

The editor never initializes SCORM. Shared renderers receive typed slides; the preview owns navigation and speech cleanup. Future Scorm12Adapter can wrap the preserved helper behind LmsAdapter after addressing the documented reference limitations. No export or advanced interaction has been implemented in Phase 0.
