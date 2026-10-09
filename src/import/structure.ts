import {
  activitySchema,
  type ImportedLessonDocument,
  type LessonDocumentBlock,
  type PedagogicalAnalysis,
} from "./model";
import { normalizeHeading, parseDuration, parseGrade } from "./analyzer";
import { detectLessonMetadata, finalizeLessonDuration } from "./lessonMetadata";
import {
  periodHeading,
  nonActivityBoundary,
  finalizeActivityStructure,
} from "./activityStructure";
import { resolveCellRoles, type TableColumn } from "./tableRoles";
import { createContext } from "./structure/context";
import { assign, emit, source } from "./structure/record";
import {
  cleaned,
  heading,
  metaRules,
  stageMap,
  type Category,
} from "./structure/rules";

export function classifyStructuredDocument(
  doc: ImportedLessonDocument,
  a: PedagogicalAnalysis,
) {
  const ctx = createContext(doc, a);
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
        ? /^[a-z]\)/.test(text.trim())
          ? 3
          : /^[IVXLCDM]+$/i.test(numbered[1])
            ? 1
            : 2
        : h.field === "teachingActivities"
          ? 2
          : 3);
    while (ctx.stack.length && ctx.stack[ctx.stack.length - 1].level >= level)
      ctx.stack.pop();
    if (
      h.category === "PREPARATION" ||
      h.category === "TEACHING_ACTIVITY" ||
      h.category === "LEARNING_OUTCOME"
    ) {
      ctx.stack.length = 0;
      ctx.active = undefined;
    }
    if (h.field !== "teachingActivities") ctx.active = undefined;
    ctx.stack.push({
      category: h.category,
      field: h.field,
      level,
      heading: h.label,
    });
    emit(
      ctx,
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
      ctx.active = activitySchema.parse({
        id: `${doc.id}-activity-${block.id}-${row ?? 0}`,
        title: cleaned(text),
        stage: stageMap[h.category] ?? null,
        source: source(
          ctx,
          block,
          text,
          row,
          column,
          parseDuration(text) === null ? 0.7 : 0.85,
          parseDuration(text) === null,
        ),
        periodId: ctx.periodId,
        content: [],
        estimatedMinutes: parseDuration(text),
      });
      a.teachingActivities.push(ctx.active);
    }
    if (h.value)
      assign(
        ctx,
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
    const facts = detectLessonMetadata(
      text,
      ctx.stack.length === 0 && !ctx.active,
    );
    for (const fact of facts) {
      const previous = a[fact.field];
      if (
        previous !== undefined &&
        previous !== null &&
        previous !== "" &&
        previous !== fact.value
      ) {
        a.sourceWarnings.push(
          "Thông tin xung đột: " + text + ". Giữ giá trị đầu tiên.",
        );
        assign(
          ctx,
          block,
          text,
          "OTHER",
          "unmappedContent",
          ["Xung đột metadata"],
          0.4,
          row,
          column,
        );
        continue;
      }
      (a as unknown as Record<string, unknown>)[fact.field] = fact.value;
      emit(
        ctx,
        block,
        text,
        "LESSON_IDENTITY",
        fact.field,
        ["Khai báo rõ trong nguồn"],
        0.9,
        false,
        row,
        column,
      );
    }
    if (
      facts.length &&
      !(facts.length === 1 && facts[0].field === "lessonNumber")
    )
      return true;
    for (const [re, key] of metaRules) {
      const match = cleaned(text).match(re);
      if (!match) continue;
      let value =
        key === "durationMinutes"
          ? parseDuration(
              /số tiết/i.test(text) && !/phút|giờ/i.test(match[1])
                ? match[1] + " tiết"
                : match[1],
            )
          : key === "curriculumGrade" || key === "targetAudienceGrade"
            ? parseGrade(match[1])
            : match[1].trim();
      const numberedSession = text.match(
        /^\s*bài\s+(\d+)\s*[:：]\s*(.*?)\s*\((?:t|tiết)\s*(\d+)\)\s*$/iu,
      );
      if (key === "lessonTitle" && numberedSession)
        value = `Bài ${numberedSession[1]} — ${numberedSession[2]} (Tiết ${numberedSession[3]})`;
      if (value === null || value === "") {
        a.sourceWarnings.push(
          `Chưa xác định ${key === "durationMinutes" ? "thời lượng theo phút" : "lớp"} từ “${text}”.`,
        );
        assign(
          ctx,
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
          ctx,
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
        ctx,
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
        ctx,
        block,
        text,
        "LESSON_IDENTITY",
        "subject",
        ["+0.55 tiêu đề giáo án", "+0.30 môn/lớp ghi rõ"],
        0.85,
      );
      emit(
        ctx,
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
    const session = periodHeading(text);
    if (session) {
      ctx.active = undefined;
      ctx.stack.length = 0;
      ctx.stack.push({
        category: "TEACHING_ACTIVITY",
        field: "teachingActivities",
        level: 1,
        heading: text,
      });
      ctx.periodId = doc.id + "-period-" + block.id + "-" + (row ?? 0);
      (a.teachingPeriods ??= []).push({
        id: ctx.periodId,
        number: session.number,
        durationMinutes: session.durationMinutes,
        source: source(ctx, block, text, row, column, 0.95),
      });
      emit(
        ctx,
        block,
        text,
        "TEACHING_ACTIVITY",
        "teachingPeriods",
        ["Tiêu đề tiết ghi rõ trong nguồn"],
        0.95,
        true,
        row,
        column,
      );
      return;
    }
    if (/^[.\s…_–-]+$/.test(text.trim()) || nonActivityBoundary(text)) {
      if (nonActivityBoundary(text)) {
        ctx.active = undefined;
        ctx.stack.length = 0;
        ctx.stack.push({
          category: "OTHER",
          field: "unmappedContent",
          level: 1,
          heading: text,
        });
      }
      assign(
        ctx,
        block,
        text,
        "OTHER",
        "unmappedContent",
        ["Ghi chú/đánh giá/phiếu hoặc dòng trống; không phải hoạt động"],
        0.35,
        row,
        column,
      );
      return;
    }
    if (
      startHeading(block, text, row, column) ||
      identity(block, text, row, column)
    )
      return;
    // A lead-in within objectives preserves the parent section rather than
    // starting an unknown section. This is a structural hint, not semantic AI.
    const parent = ctx.stack.at(-1);
    if (
      parent &&
      ["LEARNING_OUTCOME", "KNOWLEDGE"].includes(parent.category) &&
      /^sau bai(?: hoc)?(?: nay)?,? (?:hs|hoc sinh) se\s*:$/.test(
        normalizeHeading(text),
      )
    ) {
      emit(
        ctx,
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
      const activityParent = [...ctx.stack]
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
          ctx,
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
      while (ctx.stack.length && ctx.stack[ctx.stack.length - 1].level >= level)
        ctx.stack.pop();
      ctx.stack.push({
        category: "OTHER",
        field: "unmappedContent",
        level,
        heading: text,
      });
      ctx.active = undefined;
      emit(
        ctx,
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
        ctx,
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
    const context = ctx.stack[ctx.stack.length - 1];
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
        ctx,
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
        ctx,
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
    if (
      /^(?:(?:hoat dong(?: cua)?|viec lam(?: cua)?) )?(?:giao vien|gv)$/.test(n)
    )
      return {
        category: "TEACHER_ACTIVITY" as Category,
        field: "activity.teacherActivity",
      };
    if (
      /^(?:(?:hoat dong(?: cua)?|viec lam(?: cua)?) )?(?:hoc sinh|hs)$/.test(n)
    )
      return {
        category: "STUDENT_ACTIVITY" as Category,
        field: "activity.studentActivity",
      };
    if (/^(?:ho tro\s*)?(?:hskt|hoc sinh khuyet tat)$/.test(n))
      return {
        category: "SPECIAL_NEEDS" as Category,
        field: "specialNeedsSupport",
      };
    const activityContext = ctx.stack.some(
      (s) => s.field === "teachingActivities",
    );
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
  function recordSubactivity(
    block: LessonDocumentBlock,
    text: string,
    row: number,
    column: number,
    allowUntimed = false,
  ) {
    if (!ctx.active || heading(text) || !/^\s*\d+[.):]+\s*/.test(text))
      return false;
    const duration = parseDuration(text);
    if (
      duration === null &&
      (!allowUntimed || text.length > 180 || /[.!?;:]\s*$/.test(text))
    )
      return false;
    (ctx.active.subactivities ??= []).push({
      title: cleaned(text),
      estimatedMinutes: duration,
      blockId: block.id,
      row,
      column,
      source: source(
        ctx,
        block,
        text,
        row,
        column,
        duration === null ? 0.7 : 0.9,
        duration === null,
      ),
    });
    emit(
      ctx,
      block,
      text,
      "TEACHING_ACTIVITY",
      "teachingActivities",
      ["Tiểu hoạt động trong hoạt động cha; giữ riêng thời lượng"],
      duration === null ? 0.7 : 0.9,
      true,
      row,
      column,
      duration === null,
    );
    return true;
  }
  function table(block: LessonDocumentBlock) {
    let columns = new Map<number, TableColumn>();
    const ambiguousRows = new Set<number>();
    block.table!.rows.forEach((row, r) => {
      const headers = row.cells.map((cell, i) => ({
        cell,
        col: cell.column ?? i,
        rule: columnRule(cell.text),
      }));
      const count = headers.filter((h) => h.rule).length;
      const single = row.cells.filter((c) => c.text.trim());
      if (single.length === 1 && periodHeading(single[0].text)) {
        paragraph(block, single[0].text, r, single[0].column ?? 0);
        return;
      }
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
          ctx,
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
          ctx,
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
      if (
        count >= 2 ||
        (r === 0 &&
          count === 1 &&
          row.cells.length === 1 &&
          headers[0].rule?.field !== "teachingActivities")
      ) {
        columns = new Map();
        for (const { cell, col, rule } of headers)
          if (rule) {
            for (let j = 0; j < (cell.colspan ?? 1); j++)
              columns.set(col + j, {
                ...rule,
                header: cell.text,
                reviewThrough:
                  (cell.rowspan ?? 1) > 1
                    ? r + (cell.rowspan ?? 1) - 1
                    : undefined,
              });
            emit(
              ctx,
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
      if (single.length === 1 && !single[0].complex) {
        const cell = single[0];
        const texts = cell.paragraphs?.length
          ? cell.paragraphs
          : cell.text.split("\n");
        if (
          heading(texts[0] ?? "") ||
          (ctx.active &&
            /^\s*\d+[.):]+/.test(texts[0] ?? "") &&
            parseDuration(texts[0] ?? "") !== null)
        ) {
          let field = "activity.content";
          for (const text of texts) {
            if (
              (!ctx.active || text === texts[0] || /^\s*\d+[.)]/.test(text)) &&
              startHeading(block, text, r, cell.column ?? 0)
            )
              continue;
            const duration = parseDuration(text);
            if (
              ctx.active &&
              duration !== null &&
              recordSubactivity(block, text, r, cell.column ?? 0)
            )
              continue;
            const label = normalizeHeading(cleaned(text));
            if (/^muc tieu\s*:/.test(label)) {
              field = "activity.goals";
              const value = text.slice(text.indexOf(":") + 1).trim();
              if (value)
                assign(
                  ctx,
                  block,
                  value,
                  "TEACHING_ACTIVITY",
                  field,
                  ["Mục tiêu của hoạt động"],
                  0.9,
                  r,
                  cell.column ?? 0,
                );
              emit(
                ctx,
                block,
                text,
                "TEACHING_ACTIVITY",
                "",
                ["Nhãn mục tiêu hoạt động"],
                0.9,
                true,
                r,
                cell.column ?? 0,
              );
            } else if (/^cach (?:thuc )?(?:tien hanh|thuc hien)/.test(label)) {
              field = "activity.teacherActivity";
              emit(
                ctx,
                block,
                text,
                "TEACHING_ACTIVITY",
                "",
                ["Nhãn tổ chức hoạt động"],
                0.9,
                true,
                r,
                cell.column ?? 0,
              );
            } else if (ctx.active)
              assign(
                ctx,
                block,
                text,
                "TEACHING_ACTIVITY",
                field,
                ["Đoạn trong ô cấu trúc của hoạt động"],
                0.85,
                r,
                cell.column ?? 0,
              );
            else paragraph(block, text, r, cell.column ?? 0);
          }
          return;
        }
      }
      const title = headers.find(
        (h) => columns.get(h.col)?.field === "activity.title",
      );
      if (
        title?.cell.text &&
        (nonActivityBoundary(title.cell.text) ||
          /^[.\s…_–-]+$/.test(title.cell.text.trim()) ||
          /^phan bo thoi (?:luong|gian)/.test(
            normalizeHeading(title.cell.text),
          ))
      ) {
        paragraph(block, title.cell.text, r, title.col);
      } else if (title?.cell.text) {
        if (!startHeading(block, title.cell.text, r, title.col)) {
          ctx.active = activitySchema.parse({
            id: `${doc.id}-activity-${block.id}-${r}`,
            title: cleaned(title.cell.text),
            source: source(ctx, block, title.cell.text, r, title.col, 0.8),
            periodId: ctx.periodId,
            stage: null,
            content: [],
            estimatedMinutes: null,
          });
          a.teachingActivities.push(ctx.active);
          emit(
            ctx,
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
        if (columns.get(col)?.field === "activity.title") continue;
        let resolvedEntries = resolveCellRoles(cell, col, r, columns);
        const firstText = resolvedEntries[0]?.text;
        if (
          col === (row.cells[0].column ?? 0) &&
          firstText &&
          !cell.complex &&
          recordSubactivity(block, firstText, r, col, true)
        )
          resolvedEntries = resolvedEntries.slice(1);
        const meaningful = resolvedEntries.filter((e) => e.text.trim());
        if (
          meaningful.length &&
          meaningful.every((e) => !e.mapping) &&
          (columns.size || cell.complex || row.cells.length > 1)
        ) {
          if (columns.size || cell.complex) ambiguousRows.add(r);
          assign(
            ctx,
            block,
            meaningful.map((e) => e.text).join("\n"),
            "OTHER",
            "unmappedContent",
            ["Ô chưa rõ vai trò; giữ toàn bộ đoạn trong ô để kiểm tra"],
            0.35,
            r,
            col,
          );
          continue;
        }
        for (const resolved of resolvedEntries) {
          if (!resolved.text.trim()) continue;
          const mapping = resolved.mapping;
          if (
            mapping &&
            (ctx.active || !mapping.field.startsWith("activity."))
          ) {
            if (mapping.field === "specialNeedsSupport" && ctx.active)
              (ctx.active.specialNeedsSupport ??= []).push(
                resolved.text.trim(),
              );
            assign(
              ctx,
              block,
              resolved.text,
              mapping.category,
              mapping.field,
              [
                resolved.explicit
                  ? "Nhãn vai trò ghi rõ trong đoạn; đối chiếu nhãn cột bảng"
                  : "Ô nằm trọn trong phạm vi nhãn cột: " + mapping.header,
              ],
              resolved.explicit ? 0.9 : 0.8,
              r,
              col,
            );
          } else if (
            columns.size ||
            resolved.ambiguous ||
            cell.complex ||
            row.cells.length > 1
          ) {
            if (columns.size || cell.complex) ambiguousRows.add(r);
            assign(
              ctx,
              block,
              resolved.text,
              "OTHER",
              "unmappedContent",
              ["Ô giao vai trò, cấu trúc lồng hoặc thiếu nhãn; không tự gán"],
              0.35,
              r,
              col,
            );
          } else paragraph(block, resolved.text, r, col);
        }
      }
    });
    if (ambiguousRows.size)
      a.sourceWarnings.push(
        `Bảng ${block.sourceOrder + 1} có ô gộp/ranh giới chưa rõ ở hàng ${[...ambiguousRows].map((r) => r + 1).join(", ")}; giữ nội dung để giáo viên kiểm tra.`,
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
    ctx.line += (
      block.text ??
      block.table?.rows
        .map((r) => r.cells.map((c) => c.text).join("\t"))
        .join("\n") ??
      ""
    ).split("\n").length;
  }
  if (
    a.durationMinutes === null &&
    !a.periodCount &&
    a.teachingActivities.length &&
    a.teachingActivities.every((t) => t.estimatedMinutes !== null)
  ) {
    a.durationMinutes = a.teachingActivities.reduce(
      (sum, t) => sum + t.estimatedMinutes!,
      0,
    );
    a.sourceTraces.push(
      ...a.sourceTraces
        .filter((t) => t.field === "activityDurationMinutes")
        .map((t) => ({ ...t, field: "durationMinutes" })),
    );
  }
  finalizeLessonDuration(a);
  finalizeActivityStructure(a);
}
