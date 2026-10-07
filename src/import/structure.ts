import {
  activitySchema,
  type BlockClassification,
  type ImportedLessonDocument,
  type LessonDocumentBlock,
  type PedagogicalAnalysis,
  type TeachingActivity,
} from "./model";
import { normalizeHeading, parseDuration, parseGrade } from "./analyzer";

type Category = BlockClassification["category"];
type Section = {
  category: Category;
  field: string;
  level: number;
  heading: string;
};
const rules: [RegExp, Category, string][] = [
  [
    /^(?:yeu cau can dat|muc tieu(?: bai hoc)?)$/,
    "LEARNING_OUTCOME",
    "learningOutcomes",
  ],
  [/^(?:ve )?kien thuc$/, "KNOWLEDGE", "knowledgeObjectives"],
  [
    /^(?:noi dung (?:bai hoc|trong tam|cot loi)|kien thuc trong tam)$/,
    "KNOWLEDGE",
    "keyKnowledge",
  ],
  [
    /^(?:ve )?nang luc(?: (?!so(?: |$))[a-z]+(?: [a-z]+){0,3})?$/,
    "COMPETENCY",
    "competencies",
  ],
  [/^(?:ve )?pham chat$/, "QUALITY", "qualities"],
  [
    /^(?:do dung day hoc|thiet bi(?: day hoc)?(?: va hoc lieu)?|hoc lieu|chuan bi)$/,
    "PREPARATION",
    "unmappedContent",
  ],
  [
    /^(?:cac )?(?:hoat dong day hoc(?: chu yeu)?|tien trinh day hoc|activities)$/,
    "TEACHING_ACTIVITY",
    "teachingActivities",
  ],
  [/^(?:khoi dong|mo dau)$/, "WARMUP", "teachingActivities"],
  [
    /^(?:kham pha(?: tiep)?|hinh thanh kien thuc)$/,
    "DISCOVERY",
    "teachingActivities",
  ],
  [/^(?:thuc hanh|luyen tap)$/, "PRACTICE", "teachingActivities"],
  [
    /^(?:van dung|cung co(?: [–-] dan do)?|tong ket)$/,
    "APPLICATION",
    "teachingActivities",
  ],
  [
    /^(?:danh gia|kiem tra danh gia|minh chung danh gia)$/,
    "ASSESSMENT",
    "assessmentEvidence",
  ],
  [
    /^(?:tich hop )?nang luc so$/,
    "DIGITAL_COMPETENCY",
    "digitalCompetencyIntegration",
  ],
  [
    /^(?:tich hop(?: giao duc)? ai|tri tue nhan tao)$/,
    "AI_INTEGRATION",
    "aiIntegration",
  ],
  [
    /^(?:hskt|hoc sinh khuyet tat|ho tro hoc sinh(?: dac thu| khuyet tat)?)$/,
    "SPECIAL_NEEDS",
    "specialNeedsSupport",
  ],
];
function cleaned(text: string) {
  return text
    .trim()
    .replace(/^\[([^\]]+)\]$/, "$1")
    .replace(/^(?:[IVXLCDM]+|\d+(?:\.\d+)*|[A-Za-z])[.):\-]\s*/i, "")
    .replace(/^[-•*–]\s*/, "")
    .trim();
}
function heading(text: string) {
  const clean = cleaned(text);
  const colon = clean.indexOf(":");
  const label = (colon >= 0 ? clean.slice(0, colon) : clean)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/[.。]\s*$/, "")
    .trim();
  const normalized = normalizeHeading(
    label.replace(/^hoạt động\s*\d*\s*[:.\-–]?\s*/i, ""),
  );
  const rule =
    rules.find(([re]) => re.test(normalizeHeading(label))) ??
    rules.find(([re]) => re.test(normalized));
  return rule
    ? {
        category: rule[1],
        field: rule[2],
        value: colon >= 0 ? clean.slice(colon + 1).trim() : "",
        label,
      }
    : null;
}
const stageMap: Partial<Record<Category, TeachingActivity["stage"]>> = {
  WARMUP: "OPENING",
  DISCOVERY: "DISCOVERY",
  PRACTICE: "PRACTICE",
  APPLICATION: "APPLICATION",
};
const metaRules: [RegExp, keyof PedagogicalAnalysis][] = [
  [/^(?:môn học|môn|lĩnh vực)\s*[:：]\s*(.+)$/iu, "subject"],
  [
    /^(?:lớp chương trình|khối lớp|lớp|khối)\s*[:：]?\s*(\d{1,2})(?:\s.*)?$/iu,
    "curriculumGrade",
  ],
  [
    /^(?:đối tượng học sinh|lớp học sinh|lớp đối tượng|đối tượng)\s*[:：]?\s*(.+)$/iu,
    "targetAudienceGrade",
  ],
  [
    /^(?:tên bài học|tên bài|bài học|bài(?:\s+\d+)?)\s*[:：]\s*(.+)$/iu,
    "lessonTitle",
  ],
  [/^chủ đề(?:\s+[^:：]+)?\s*[:：]\s*(.+)$/iu, "topic"],
  [
    /^\(?(?:thời lượng|thời gian|số tiết)\s*[:：]\s*(.+?)\)?$/iu,
    "durationMinutes",
  ],
  [/^chương trình\s*[:：]\s*(.+)$/iu, "curriculum"],
];
export function classifyStructuredDocument(
  doc: ImportedLessonDocument,
  a: PedagogicalAnalysis,
) {
  const stack: Section[] = [];
  let active: TeachingActivity | undefined;
  let seq = 0;
  let line = 1;
  function emit(
    block: LessonDocumentBlock,
    sourceText: string,
    category: Category,
    field: string,
    signals: string[],
    confidence: number,
    isHeading = false,
    row?: number,
    column?: number,
    needsReview = false,
  ) {
    const c: BlockClassification = {
      id: `${block.id}-${seq++}`,
      blockId: block.id,
      sourceText,
      category,
      field,
      signals,
      confidence,
      isHeading,
      row,
      column,
      needsReview,
      corrected: false,
    };
    a.classifications.push(c);
    let sourceLine = line;
    if (row !== undefined && block.table) {
      for (const previousRow of block.table.rows.slice(0, row))
        sourceLine += previousRow.cells
          .map((c) => c.text)
          .join("\t")
          .split("\n").length;
      const cells = block.table.rows[row]?.cells ?? [];
      const current = cells.find(
        (c) => (c.column ?? cells.indexOf(c)) === column,
      );
      for (const cell of cells) {
        if (cell === current) break;
        sourceLine += cell.text.split("\n").length - 1;
      }
      const offset = current?.text.indexOf(sourceText) ?? -1;
      if (offset > 0)
        sourceLine += current!.text.slice(0, offset).split("\n").length - 1;
    }
    if (!isHeading)
      a.sourceTraces.push({
        field: field.split("[")[0],
        sourceText,
        lineStart: sourceLine,
        lineEnd: sourceLine + sourceText.split("\n").length - 1,
        confidence,
        blockId: block.id,
        row,
        column,
      });
    return c;
  }
  function assign(
    block: LessonDocumentBlock,
    text: string,
    category: Category,
    field: string,
    signals: string[],
    confidence: number,
    row?: number,
    column?: number,
  ) {
    const value = text.trim().replace(/^[-•*–]\s*/, "");
    if (!value) return;
    let target = field;
    const needsReview = confidence < 0.6 || category === "OTHER";
    if (needsReview) {
      target = "unmappedContent";
      category = "OTHER";
    }
    if (target.startsWith("activity.")) {
      if (!active) {
        active = activitySchema.parse({
          id: `${doc.id}-activity-${block.id}-${row ?? 0}`,
          title: "Hoạt động chưa xác định",
          stage: null,
          content: [],
          estimatedMinutes: null,
        });
        a.teachingActivities.push(active);
      }
      const key = target.slice(9) as
        | "content"
        | "teacherActivity"
        | "studentActivity"
        | "goals"
        | "products"
        | "organization";
      const values = active[key];
      target = `teachingActivities[${a.teachingActivities.indexOf(active)}].${key}[${values.length}]`;
      values.push(value);
    } else {
      const values = a[target as keyof PedagogicalAnalysis];
      if (!Array.isArray(values)) return;
      target = `${target}[${values.length}]`;
      (values as string[]).push(value);
    }
    emit(
      block,
      text,
      category,
      target,
      signals,
      confidence,
      false,
      row,
      column,
      needsReview,
    );
  }
  function startHeading(
    block: LessonDocumentBlock,
    text: string,
    row?: number,
    column?: number,
  ) {
    const h = heading(text);
    if (!h) return false;
    const numbered = /^\s*([IVXLCDM]+|\d+(?:\.\d+)*|[A-Z])[.)]/i.exec(text);
    const level =
      block.level ??
      (numbered
        ? /^[IVXLCDM]+$/i.test(numbered[1])
          ? 1
          : 2
        : h.field === "teachingActivities"
          ? 2
          : 3);
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (
      h.category === "PREPARATION" ||
      h.category === "TEACHING_ACTIVITY" ||
      h.category === "LEARNING_OUTCOME"
    ) {
      stack.length = 0;
      active = undefined;
    }
    if (h.field !== "teachingActivities") active = undefined;
    stack.push({
      category: h.category,
      field: h.field,
      level,
      heading: h.label,
    });
    emit(
      block,
      text,
      h.category,
      "",
      ["+0.55 tiêu đề khớp nhóm", "+0.25 ranh giới mục xác định"],
      0.8,
      true,
      row,
      column,
    );
    if (
      h.field === "teachingActivities" &&
      h.category !== "TEACHING_ACTIVITY"
    ) {
      active = activitySchema.parse({
        id: `${doc.id}-activity-${block.id}-${row ?? 0}`,
        title: cleaned(text),
        stage: stageMap[h.category] ?? null,
        content: [],
        estimatedMinutes: parseDuration(text),
      });
      a.teachingActivities.push(active);
    }
    if (h.value)
      assign(
        block,
        h.category === "AI_INTEGRATION" ? cleaned(text) : h.value,
        h.category,
        h.field === "teachingActivities" ? "activity.content" : h.field,
        ["+0.55 nhãn mục", "+0.25 nội dung cùng nhãn"],
        h.category === "AI_INTEGRATION" ? 0.95 : 0.8,
        row,
        column,
      );
    return true;
  }
  function identity(
    block: LessonDocumentBlock,
    text: string,
    row?: number,
    column?: number,
  ) {
    for (const [re, key] of metaRules) {
      const match = cleaned(text).match(re);
      if (!match) continue;
      const value =
        key === "durationMinutes"
          ? parseDuration(
              /số tiết/i.test(text) && !/phút|giờ/i.test(match[1])
                ? match[1] + " tiết"
                : match[1],
            )
          : key === "curriculumGrade" || key === "targetAudienceGrade"
            ? parseGrade(match[1])
            : match[1].trim();
      if (value === null || value === "") {
        a.sourceWarnings.push(
          `Chưa xác định ${key === "durationMinutes" ? "thời lượng theo phút" : "lớp"} từ “${text}”.`,
        );
        assign(
          block,
          text,
          "OTHER",
          "unmappedContent",
          ["+0.55 nhãn thông tin", "-0.15 giá trị thiếu hoặc chưa rõ đơn vị"],
          0.4,
          row,
          column,
        );
        return true;
      }
      if (a[key] !== "" && a[key] !== null && a[key] !== value) {
        a.sourceWarnings.push(
          `Thông tin xung đột: ${text}. Giữ giá trị đầu tiên.`,
        );
        assign(
          block,
          text,
          "OTHER",
          "unmappedContent",
          ["+0.55 nhãn thông tin", "-0.15 xung đột thông tin đã có"],
          0.4,
          row,
          column,
        );
        return true;
      }
      (a as unknown as Record<string, unknown>)[key] = value;
      emit(
        block,
        text,
        "LESSON_IDENTITY",
        key,
        ["+0.55 nhãn thông tin", "+0.30 giá trị đúng dạng"],
        0.85,
        false,
        row,
        column,
      );
      return true;
    }
    // Explicit identity inside a document title, not a default subject or grade.
    const identityTitle = text
      .replace(/^GIÁO ÁN\s+TUẦN\s+\d+\s*[–—-]\s*/iu, "GIÁO ÁN ")
      .replace(/\s*\(.*\)\s*$/u, "");
    const title = identityTitle.match(
      /^GIÁO ÁN\s+(?!TUẦN\b)(.+?)\s+(?:LỚP\s+)?(1[0-2]|[1-9])(?:\s*[–—-].*)?$/iu,
    );
    if (title) {
      if (!a.subject) a.subject = title[1];
      if (!a.curriculumGrade) a.curriculumGrade = title[2];
      emit(
        block,
        text,
        "LESSON_IDENTITY",
        "subject",
        ["+0.55 tiêu đề giáo án", "+0.30 môn/lớp ghi rõ"],
        0.85,
      );
      emit(
        block,
        text,
        "LESSON_IDENTITY",
        "curriculumGrade",
        ["+0.55 tiêu đề giáo án", "+0.30 lớp ghi rõ"],
        0.85,
      );
      return true;
    }
    return false;
  }
  function paragraph(
    block: LessonDocumentBlock,
    text: string,
    row?: number,
    column?: number,
  ) {
    if (!text.trim()) return;
    if (
      startHeading(block, text, row, column) ||
      identity(block, text, row, column)
    )
      return;
    // A lead-in within objectives preserves the parent section rather than
    // starting an unknown section. This is a structural hint, not semantic AI.
    const parent = stack.at(-1);
    if (
      parent &&
      ["LEARNING_OUTCOME", "KNOWLEDGE"].includes(parent.category) &&
      /^sau bai hoc(?: nay)?,? (?:hs|hoc sinh) se\s*:$/.test(
        normalizeHeading(text),
      )
    ) {
      emit(
        block,
        text,
        parent.category,
        "",
        ["Mở đầu danh sách trong mục tiêu cha"],
        0.9,
        true,
        row,
        column,
      );
      return;
    }
    const isBoundary =
      block.type === "HEADING" ||
      /^\s*[IVXLCDM]+[.)]\s*/i.test(text) ||
      /:\s*$/.test(text);
    if (isBoundary) {
      const activityParent = [...stack]
        .reverse()
        .find((s) => s.field === "teachingActivities");
      const isMajor = /^\s*[IVXLCDM]+[.)]\s*/i.test(text);
      if (
        activityParent &&
        !isMajor &&
        (block.level === undefined || block.level > activityParent.level)
      ) {
        // A named task/subheading inside an activity remains in that activity;
        // it is not an instructional objective just because it contains “học sinh”.
        assign(
          block,
          text,
          "TEACHING_ACTIVITY",
          "activity.content",
          [
            "+0.55 mục hoạt động cha: " + activityParent.heading,
            "+0.20 tiểu mục nằm trong hoạt động",
            "-0.05 tiêu đề con chưa biết tên",
          ],
          0.7,
          row,
          column,
        );
        return;
      }
      const level = block.level ?? 1;
      while (stack.length && stack[stack.length - 1].level >= level)
        stack.pop();
      stack.push({
        category: "OTHER",
        field: "unmappedContent",
        level,
        heading: text,
      });
      active = undefined;
      emit(
        block,
        text,
        "OTHER",
        "",
        ["+0.30 nhận ra ranh giới tiêu đề, chưa xác định nhóm"],
        0.3,
        true,
        row,
        column,
      );
      assign(
        block,
        text,
        "OTHER",
        "unmappedContent",
        ["+0.30 nhận ra tiêu đề, chưa xác định nhóm"],
        0.3,
        row,
        column,
      );
      return;
    }
    const context = stack[stack.length - 1];
    if (context) {
      const signals =
        context.category === "OTHER"
          ? ["+0.30 mục cha chưa phân loại; chưa có căn cứ gán nhóm"]
          : [
              "+0.55 tiêu đề gần nhất: " + context.heading,
              "+0.25 nằm trong ranh giới mục",
            ];
      const lexical =
        context.category !== "OTHER" &&
        /nhận biết|nêu được|thực hiện|hợp tác|trung thực/i.test(text)
          ? 0.05
          : 0;
      if (lexical)
        signals.push(
          "+0.05 cụm từ phù hợp nội dung giáo dục (không tự quyết định nhóm)",
        );
      assign(
        block,
        text,
        context.category,
        context.field === "teachingActivities"
          ? "activity.content"
          : context.field,
        signals,
        context.category === "OTHER" ? 0.3 : 0.8 + lexical,
        row,
        column,
      );
    } else
      assign(
        block,
        text,
        "OTHER",
        "unmappedContent",
        ["0.00 thiếu tiêu đề hoặc cột xác định"],
        0,
        row,
        column,
      );
  }
  function columnRule(text: string) {
    const n = normalizeHeading(cleaned(text)).replace(/[:.]$/g, "");
    if (/^(?:hoat dong(?: cua)?|viec lam(?: cua)?) (?:giao vien|gv)$/.test(n))
      return {
        category: "TEACHER_ACTIVITY" as Category,
        field: "activity.teacherActivity",
      };
    if (/^(?:hoat dong(?: cua)?|viec lam(?: cua)?) (?:hoc sinh|hs)$/.test(n))
      return {
        category: "STUDENT_ACTIVITY" as Category,
        field: "activity.studentActivity",
      };
    const activityContext = stack.some((s) => s.field === "teachingActivities");
    if (activityContext) {
      const cols: Record<string, string> = {
        "hoat dong": "title",
        "muc tieu": "goals",
        "noi dung": "content",
        "san pham": "products",
        "to chuc thuc hien": "organization",
        "danh gia": "assessmentEvidence",
      };
      if (n in cols)
        return {
          category:
            n === "danh gia"
              ? ("ASSESSMENT" as Category)
              : ("TEACHING_ACTIVITY" as Category),
          field:
            cols[n] === "assessmentEvidence"
              ? "assessmentEvidence"
              : `activity.${cols[n]}`,
        };
    }
    const h = heading(text);
    return h ? { category: h.category, field: h.field } : null;
  }
  function table(block: LessonDocumentBlock) {
    let columns = new Map<
      number,
      { category: Category; field: string; header: string }
    >();
    let complex = false;
    block.table!.rows.forEach((row, r) => {
      const headers = row.cells.map((cell, i) => ({
        cell,
        col: cell.column ?? i,
        rule: columnRule(cell.text),
      }));
      const count = headers.filter((h) => h.rule).length;
      if (
        row.cells.length === 2 &&
        count === 0 &&
        /^(?:môn(?: học)?|lớp|tên bài|thời lượng|chương trình)\s*:??\s*$/iu.test(
          row.cells[0].text,
        )
      ) {
        identity(
          block,
          `${row.cells[0].text.replace(/:\s*$/, "")}: ${row.cells[1].text}`,
          r,
          row.cells[0].column ?? 0,
        );
        return;
      }
      if (
        row.cells.length === 2 &&
        count === 1 &&
        headers[0].rule &&
        headers[0].rule.field !== "teachingActivities" &&
        headers[0].rule.field !== "activity.title"
      ) {
        const { rule, cell } = headers[0];
        emit(
          block,
          cell.text,
          rule.category,
          "",
          ["+0.60 nhãn hàng bảng", "+0.20 ô giá trị kế bên"],
          0.8,
          true,
          r,
          0,
        );
        assign(
          block,
          row.cells[1].text,
          rule.category,
          rule.field,
          ["+0.60 nhãn hàng: " + cell.text, "+0.20 ô giá trị kế bên"],
          0.8,
          r,
          row.cells[1].column ?? 1,
        );
        return;
      }
      if (count >= 2 || (r === 0 && count === 1 && row.cells.length === 1)) {
        columns = new Map();
        for (const { cell, col, rule } of headers)
          if (rule) {
            if ((cell.colspan ?? 1) > 1 || (cell.rowspan ?? 1) > 1)
              complex = true;
            for (let j = 0; j < (cell.colspan ?? 1); j++)
              columns.set(col + j, { ...rule, header: cell.text });
            emit(
              block,
              cell.text,
              rule.category,
              "",
              ["+0.60 nhãn cột bảng", "+0.20 hàng tiêu đề"],
              0.8,
              true,
              r,
              col,
            );
          }
        return;
      }
      // Full-width activity/section title inside a table retains the surrounding columns.
      if (row.cells.length === 1 && heading(row.cells[0].text)) {
        startHeading(block, row.cells[0].text, r, row.cells[0].column ?? 0);
        return;
      }
      const title = headers.find(
        (h) => columns.get(h.col)?.field === "activity.title",
      );
      if (title?.cell.text) {
        if (!startHeading(block, title.cell.text, r, title.col)) {
          active = activitySchema.parse({
            id: `${doc.id}-activity-${block.id}-${r}`,
            title: cleaned(title.cell.text),
            stage: null,
            content: [],
            estimatedMinutes: null,
          });
          a.teachingActivities.push(active);
          emit(
            block,
            title.cell.text,
            "TEACHING_ACTIVITY",
            `teachingActivities[${a.teachingActivities.length - 1}].title`,
            ["+0.60 cột Hoạt động", "+0.20 hàng dữ liệu"],
            0.8,
            false,
            r,
            title.col,
          );
        }
      }
      for (const { cell, col } of headers) {
        const covered = Array.from({ length: cell.colspan ?? 1 }, (_, j) =>
          columns.get(col + j),
        );
        const mapping = covered[0];
        const conflict = covered.some((m) => m?.field !== mapping?.field);
        if (mapping?.field === "activity.title") continue;
        if (
          mapping &&
          !conflict &&
          !complex &&
          !cell.complex &&
          (cell.rowspan ?? 1) === 1
        ) {
          const context = stack[stack.length - 1];
          const signals = [
            "+0.60 nhãn cột: " + mapping.header,
            "+0.20 ô nằm dưới cột xác định",
          ];
          if (context) signals.push("ngữ cảnh mục: " + context.heading);
          for (const text of cell.paragraphs?.length
            ? cell.paragraphs
            : cell.text.split("\n"))
            assign(
              block,
              text,
              mapping.category,
              mapping.field,
              signals,
              0.8,
              r,
              col,
            );
        } else if (
          mapping ||
          conflict ||
          complex ||
          cell.complex ||
          (cell.rowspan ?? 1) > 1
        ) {
          assign(
            block,
            cell.text,
            "OTHER",
            "unmappedContent",
            [
              "+0.80 nhãn bảng và ô",
              "-0.45 quan hệ ô gộp/cột chưa chắc chắn; không tự gán",
            ],
            0.35,
            r,
            col,
          );
        } else if (row.cells.length > 1 && !columns.size) {
          assign(
            block,
            cell.text,
            "OTHER",
            "unmappedContent",
            ["0.00 bảng nhiều cột chưa nhận ra nhãn; giữ ô để kiểm tra"],
            0,
            r,
            col,
          );
        } else
          for (const text of cell.paragraphs?.length
            ? cell.paragraphs
            : cell.text.split("\n"))
            paragraph(block, text, r, col);
      }
    });
    if (complex)
      a.sourceWarnings.push(
        `Bảng ${block.sourceOrder + 1} có tiêu đề gộp nhiều hàng/cột; nội dung cần giáo viên phân loại lại.`,
      );
  }
  a.sourceWarnings.push(...doc.extractionWarnings);
  for (const block of [...doc.blocks].sort(
    (x, y) => x.sourceOrder - y.sourceOrder,
  )) {
    if (block.type === "TABLE" && block.table) table(block);
    else
      for (const text of block.items?.length ? block.items : [block.text ?? ""])
        paragraph(block, text);
    line += (
      block.text ??
      block.table?.rows
        .map((r) => r.cells.map((c) => c.text).join("\t"))
        .join("\n") ??
      ""
    ).split("\n").length;
  }
}
