# DOCX comparison report

## Acceptance status

The exact DOCX that reproduced the user's failure has not been identified. The new attachment contains instructions, not a DOCX. No DOCX was present in the repository or Codex attachment folders. Relevant lesson plans were found in Downloads and inspected read-only. A question asking for the exact filename remains unanswered at this checkpoint.

**Original failure-file acceptance: PENDING — do not interpret the following candidate-file results as acceptance of that unidentified file.**

## Reproduction before changes

At f3cf40be6abfe10d5b5ecebda6a7b88f9789144f, `importPlanFile` rejected every DOCX as “sắp hỗ trợ” and the chooser accepted TXT only. Therefore text, paragraphs, headings, tables, rows/cells, merges and Word numbering were not extracted at all. The analyzer received no DOCX structure. Its TXT/paste line rules could not recover teacher/student columns from flattened text.

The real candidates show why a text-only fix is insufficient: both table lessons have numbered outcome subsections, a separate preparation section, five GV/HS tables and a final consolidation section. Their cells contain multiple line breaks within Word paragraphs. No merged cells occur in these candidates; merge handling is verified with generated OOXML regression cases, not claimed as real-file coverage.

## Candidate A — real table lesson

Source: `C:\Users\user\Downloads\Giao_an_day_du_bang.docx`

Byte-identical regression copy: `src/fixtures/docx/real-lesson-tables.docx`

SHA256: `CA43A0187F45E8997CD1503BB0AA6DDA9630236850F71EE58DB7B3CFBE54B171`

Structural extraction: 35 ordered blocks, including five tables. Each table has two rows and two columns. Heading text/number prefixes and cell line breaks remain. These headings are manually formatted Word paragraphs, not declared Word heading styles; semantic classification recognizes their text. Explicit/inherited heading styles and automatic numbering have separate tests.

| Field | EXPECTED from source | EXTRACTED |
|---|---|---|
| Môn | TIN HỌC in document title | TIN HỌC |
| Lớp | 5 in document title | 5; target audience stays blank |
| Tên bài | BÀI 9: CẤU TRÚC TUẦN TỰ | CẤU TRÚC TUẦN TỰ |
| Chủ đề | GIẢI QUYẾT VẤN ĐỀ VỚI SỰ TRỢ GIÚP CỦA MÁY TÍNH | Exact source title |
| Thời lượng | “... tiết”, no numeric minutes | null, source retained and warning |
| Yêu cầu cần đạt | Parent section with knowledge/competency/quality subsections | Parent classified LEARNING_OUTCOME; child lists kept separate, no fabricated direct outcomes |
| Kiến thức | Two bullets about sequence and variables | Two knowledgeObjectives, no equipment/activity contamination |
| Năng lực | One common competency statement and two Tin học bullets | Three competencies |
| Phẩm chất | Chăm chỉ, cẩn thận, có trách nhiệm | One qualities item |
| Chuẩn bị | GV/HS materials under II. ĐỒ DÙNG DẠY HỌC | PREPARATION, preserved in unmappedContent, excluded from objectives |
| Hoạt động | Khởi động, Khám phá, Luyện tập, Thực hành, Vận dụng; final Củng cố–Dặn dò | Six activities; the five main ones each retain separate teacherActivity/studentActivity |
| Đánh giá | No explicit assessment section/evidence | Empty, warning; no inference from activity words |
| HSKT | Not present | Empty |
| Năng lực số | No explicit section | Empty |
| Tích hợp AI | One statement under [TÍCH HỢP AI] | One aiIntegration item |
| Chương trình | No explicit curriculum standard | Blank; book-series title is not invented as GDPT metadata |

Manual browser check used this DOCX through the actual chooser. Review fields, GV/HS textareas, source block table view, corrections, add/delete list items and activities, back/resume, reanalysis replacement/cancel, and confirmation were exercised. A saved eight-slide Phase 1 lesson reopened and preview advanced to page 2/8; recent project count remained five. The in-memory DOCX draft survived the dashboard/editor round trip.

## Candidate B — real paragraph lesson with AI content

Source: `C:\Users\user\Downloads\Giao_an_Tuan_2_Tich_hop_AI.docx`

Byte-identical regression copy: `src/fixtures/docx/real-lesson-ai.docx`

SHA256: `7712D1993E2E42B5C2034E70C6F1C449515DFF94CCE1A49D755D24232F7D6C32`

Structural extraction: 47 ordered paragraph blocks, no tables. Verified by OOXML inspection and end-to-end diagnostic/tests.

| Field | EXPECTED from source | EXTRACTED |
|---|---|---|
| Môn / lớp | “GIÁO ÁN TUẦN 2 – TIN HỌC LỚP 3” | TIN HỌC / 3; tuần 2 is not a grade |
| Tên bài | XỬ LÍ THÔNG TIN (2 TIẾT – TÍCH HỢP AI) | Exact title |
| Thời lượng | Two periods mentioned in title; no explicit minutes | null; no conversion |
| Mục tiêu | Parent with knowledge/competency/quality children | Parent detected; child lists kept separate |
| Kiến thức / năng lực / phẩm chất | Three / two / one statements | Three / two / one |
| Hoạt động | Khởi động, Khám phá, Khám phá tiếp, Luyện tập, Vận dụng, Củng cố | Six activities; named subheadings and their text remain inside activities |
| Đánh giá / HSKT / năng lực số | No explicit sections | Empty |
| AI | Mentioned within title, knowledge, competencies and activities; no standalone integration section | Mentions stay in their source categories; aiIntegration remains empty, not guessed from one keyword |
| Dặn dò | Separate final major section | Unknown section retained for teacher classification, does not extend objectives |

## Structural cases beyond these candidates

Tests cover heading-style inheritance, Roman list numbering, alternative mục tiêu labels, subject-specific competencies, horizontal/vertical merges and orphan merges, teacher/student headers, activity property columns and vertical property rows, unknown multicolumn fallback, source block/cell traces, ambiguous content, consecutive teacher transfers, stale-index invalidation, invalid ZIP/XML/DTD, expansion limits, cancellation and late file/analysis results.

No claim is made for Word page layout reconstruction, OCR, arbitrary nested tables or full semantic interpretation. No external paid AI was integrated. The teacher still needs to test the **same original DOCX** and review this report against that file.
