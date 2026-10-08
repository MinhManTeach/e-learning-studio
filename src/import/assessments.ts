import { normalizeHeading } from "./analyzer";
import {
  assessmentSchema,
  type Assessment,
  type AssessmentSource,
} from "./assessmentModel";
import type { ImportedLessonDocument, PedagogicalAnalysis } from "./model";
const norm = (s: string) => normalizeHeading(s).replace(/\s+/g, " ").trim();
function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
function units(doc: ImportedLessonDocument, a: PedagogicalAnalysis) {
  const result: AssessmentSource[] = [];
  let ti = -1;
  let activityId: string | undefined, periodId: string | undefined;
  for (const b of doc.blocks) {
    if (b.table) ti++;
    const cells = b.table
      ? b.table.rows.flatMap((r, row) =>
          r.cells.map((c, col) => ({
            texts: c.paragraphs ?? [c.text],
            row,
            column: c.column ?? col,
          })),
        )
      : [
          {
            texts: b.items ?? [b.text ?? ""],
            row: undefined,
            column: undefined,
          },
        ];
    for (const cell of cells)
      cell.texts.forEach((sourceText, paragraph) => {
        if (
          !b.table &&
          /^(?:[ivx\d]+[.)]\s*)?(?:phieu hoc tap|danh gia sau|bang danh gia)/.test(
            norm(sourceText),
          )
        ) {
          activityId = undefined;
          periodId = undefined;
        }
        const period = a.teachingPeriods?.find(
          (p) =>
            p.source.blockId === b.id &&
            p.source.row === cell.row &&
            p.source.sourceText === sourceText,
        );
        if (period) {
          periodId = period.id;
          activityId = undefined;
        }
        const activity = a.teachingActivities.find(
          (t) =>
            t.source?.blockId === b.id &&
            t.source.row === cell.row &&
            t.source.sourceText === sourceText,
        );
        if (activity) activityId = activity.id;
        const c = a.classifications.find(
          (c) =>
            c.blockId === b.id &&
            c.row === cell.row &&
            c.column === cell.column &&
            c.sourceText.includes(sourceText),
        );
        sourceText.split(/\n|(?<=\?)\s+(?=GV chốt:)/u).forEach((part, line) =>
          result.push({
            blockId: b.id,
            sourceText: part,
            originalSourceText: sourceText,
            line,
            tableIndex: b.table ? ti : undefined,
            row: cell.row,
            column: cell.column,
            paragraph,
            activityId,
            periodId,
            role:
              c?.category === "TEACHER_ACTIVITY"
                ? "TEACHER"
                : c?.category === "STUDENT_ACTIVITY"
                  ? "STUDENT"
                  : "UNKNOWN",
          }),
        );
      });
  }
  return result;
}
function questionType(text: string): Assessment["type"] | null {
  const n = norm(text).replace(/^[-•*–]\s*/, "");
  if (
    /^(?:tro choi|vi du|ghi chu|luu y|(?:(?:hs|hoc sinh)\s+)?tham gia hoat dong|cau tra loi|giao tiep va hop tac)|gv kiem tra.*san sang/.test(
      n,
    )
  )
    return null;
  if (
    /(?:tieu chi(?: danh gia)?|rubric|bang kiem|cach danh gia)\s*[:：].+/.test(
      n,
    )
  )
    return /quan sat/.test(n) ? "OBSERVATION" : "PERFORMANCE";
  if (
    /^(?:[-•]\s*)?(?:gv\s+(?:yeu cau|to chuc)\s+(?:hs\s+)?)?(?:sap xep|danh so).*(?:buoc|thu tu)/.test(
      n,
    )
  )
    return "ORDERING";
  if (/^(?:[-•]\s*)?(?:hay\s+)?noi\s+.*(?:voi|tuong ung|cot)/.test(n))
    return "MATCHING";
  if (
    /^(?:[-•]\s*)?(?:cau\s*\d+[:.)]\s*)?dung\s*(?:hay|\/|hoac)\s*(?:chua dung|sai)|chon dung.*sai/.test(
      n,
    ) ||
    (/\?/.test(n) && /dung hay sai/.test(n))
  )
    return "TRUE_FALSE";
  if (
    /(?:cau\s*\d+\s*[:.)]|\?)/.test(n) &&
    /(?:vi sao|tai sao|the nao|nao|gi\b|bao nhieu|co (?:can|nen|the)|hay |em |ban |neu |khi |ai )/.test(
      n,
    )
  )
    return "SHORT_ANSWER";
  return null;
}
function sameScope(s: AssessmentSource, q: Assessment) {
  return s.activityId === q.activityId && s.periodId === q.periodId;
}
function keyValid(q: Assessment, value: string) {
  if (q.type === "MULTIPLE_CHOICE")
    return (
      value
        .split(/[,;\s]+/)
        .filter(Boolean)
        .every((v) =>
          q.choices.some((c) => c.label.toUpperCase() === v.toUpperCase()),
        ) && !!value.trim()
    );
  if (q.type === "MATCHING") {
    const pairs = [...value.matchAll(/(\d+)\s*[–—:-]\s*([a-z])/gi)];
    return (
      pairs.length > 0 &&
      pairs.every(
        (p) =>
          q.choices.some((c) => c.label === p[1]) &&
          q.choices.some((c) => c.label.toLowerCase() === p[2].toLowerCase()),
      )
    );
  }
  return !!value.trim();
}
function recoverAssessmentTables(
  doc: ImportedLessonDocument,
  sources: AssessmentSource[],
) {
  const items: Assessment[] = [];
  const blocks = new Set<string>();
  for (const block of doc.blocks) {
    if (!block.table) continue;
    const rows = block.table.rows;
    const headers = rows[0]?.cells.map((c) => c.text) ?? [];
    const rubric =
      /^(?:tieu chi|noi dung danh gia)$/.test(norm(headers[0] ?? "")) &&
      headers
        .slice(1)
        .some((t) => /muc do|hoan thanh|dat|ho tro/.test(norm(t)));
    const worksheet =
      headers
        .slice(1)
        .some((t) =>
          /\?|mo ta cach thuc hien|cach dieu chinh|cach xu li/.test(t),
        ) &&
      /tinh huong|tu the|thao tac|bo phan|viec lam/.test(
        norm(headers[0] ?? ""),
      );
    if (!rubric && !worksheet) continue;
    blocks.add(block.id);
    for (let row = 1; row < rows.length; row++) {
      const cells = rows[row].cells;
      if (!cells[0]?.text.trim()) continue;
      const original = sources.filter(
        (s) => s.blockId === block.id && s.row === row,
      );
      const headSources = sources.filter(
        (s) => s.blockId === block.id && s.row === 0,
      );
      const prompt = rubric
        ? cells[0].text
        : [cells[0].text, ...headers.slice(1)].filter(Boolean).join(" — ");
      items.push(
        assessmentSchema.parse({
          id: "assessment-" + hash(block.id + "|" + row + "|" + prompt),
          type: rubric
            ? "PERFORMANCE"
            : /dung hay|nen hay/.test(norm(headers.join(" ")))
              ? "TRUE_FALSE"
              : "SHORT_ANSWER",
          prompt,
          choices: [],
          rubricLevels: rubric
            ? cells.slice(1).map((c, i) => ({
                label: headers[i + 1] ?? String(i + 1),
                text: c.text,
              }))
            : [],
          answer: null,
          answerCandidates: [],
          feedback: "",
          sources: [...original, ...headSources],
          context: rubric ? "RUBRIC" : "WORKSHEET",
          confidence: 0.85,
          reviewStatus: "NEEDS_TEACHER_REVIEW",
          duplicateCount: 0,
          teacherEdited: false,
        }),
      );
    }
  }
  return { items, blocks };
}
export function extractAssessments(
  doc: ImportedLessonDocument,
  a: PedagogicalAnalysis,
): Assessment[] {
  const out: Assessment[] = [];
  const sourceUnits = units(doc, a);
  const tableItems = recoverAssessmentTables(doc, sourceUnits);
  out.push(...tableItems.items);
  let context: Assessment["context"] = "DOCUMENT";
  let last: Assessment | undefined;
  let segment = 0;
  let answerSection = false;
  const questionSegments = new Map<string, number>();
  const positions = new Map<string, number>();
  const sourcePosition = (s: AssessmentSource) =>
    sourceUnits.findIndex(
      (u) =>
        u.blockId === s.blockId &&
        u.row === s.row &&
        u.column === s.column &&
        u.paragraph === s.paragraph &&
        u.line === s.line,
    );
  const pending: {
    source: AssessmentSource;
    number?: string;
    value: string;
    explicit: boolean;
    segment: number;
  }[] = [];
  for (const source of sourceUnits) {
    if (tableItems.blocks.has(source.blockId)) continue;
    let text = source.sourceText.trim();
    const inline = text.match(
      /\s+(đáp án(?:\s+câu\s*(\d+))?)\s*[:：]\s*(.+)$/iu,
    );
    if (inline) {
      pending.push({
        source,
        number: inline[2],
        value: inline[3],
        explicit: true,
        segment,
      });
      text = text.slice(0, inline.index).trim();
    }
    const n = norm(text);
    if (!text) continue;
    if (/^(?:[ivx\d]+[.)]\s*)?phieu (?:hoc tap|thuc hanh)/.test(n)) {
      context = "WORKSHEET";
      last = undefined;
      segment++;
      answerSection = false;
      continue;
    }
    if (
      /^(?:[ivx\d]+[.)]\s*)?(?:bang danh gia|tieu chi danh gia|danh gia sau)/.test(
        n,
      ) &&
      !/:.+/.test(n)
    ) {
      context = "RUBRIC";
      last = undefined;
      segment++;
      continue;
    }
    if (
      a.teachingActivities.some(
        (t) =>
          t.source?.sourceText === source.sourceText &&
          t.source.blockId === source.blockId,
      )
    ) {
      context = "ACTIVITY";
      last = undefined;
      segment++;
      continue;
    }
    if (/^(?:dap an|huong dan dap an)\s*:??$/.test(n)) {
      answerSection = true;
      last = undefined;
      continue;
    }
    const numberedKey = answerSection
      ? text.match(/^(\d+)[.):]\s*(.+)$/u)
      : null;
    if (numberedKey) {
      pending.push({
        source,
        number: numberedKey[1],
        value: numberedKey[2],
        explicit: true,
        segment,
      });
      continue;
    }
    const answer = text.match(
      /^(?:[-•]\s*)?(?:(?:HS|học sinh)\s+(?:dự kiến\s+)?trả lời|GV chốt|đáp án(?:\s+câu\s*(\d+))?|kết quả(?:\s+câu\s*(\d+))?)\s*[:：]\s*(.+)$/iu,
    );
    if (answer) {
      pending.push({
        source,
        number: answer[1] ?? answer[2],
        value: answer[3],
        explicit: /^(?:[-•]\s*)?(?:đáp án|kết quả)/iu.test(text),
        segment,
      });
      continue;
    }
    if (/^(?:[-•]\s*)?(?:giai thich|phan hoi|loi giai)\s*:/.test(n)) {
      if (last && sameScope(source, last)) {
        last.feedback = text;
        last.sources.push(source);
      }
      continue;
    }
    const optionMatches = [
      ...text.matchAll(
        /(?:^|\s)([A-Da-d]|\d+)[.)]\s+(.+?)(?=\s+[A-Da-d][.)]\s+|$)/g,
      ),
    ];
    if (
      optionMatches.length &&
      last &&
      sameScope(source, last) &&
      !questionType(text) &&
      (last.type !== "SHORT_ANSWER" ||
        optionMatches.some((m) => /^[A-D]$/.test(m[1])))
    ) {
      for (const m of optionMatches) {
        const marked = /\((?:đáp án\s*)?(?:đúng|correct)\)/iu.test(m[2]);
        last.choices.push({
          label: m[1],
          text: m[2]
            .replace(/\((?:đáp án\s*)?(?:đúng|correct)\)/giu, "")
            .trim(),
        });
        if (marked)
          pending.push({
            source,
            number: last.number,
            value: m[1],
            explicit: true,
            segment,
          });
      }
      last.sources.push(source);
      if (
        last.type === "SHORT_ANSWER" &&
        last.choices.some((c) => /^[A-D]$/.test(c.label))
      )
        last.type = "MULTIPLE_CHOICE";
      continue;
    }
    let type = questionType(text);
    if (
      !type &&
      context === "RUBRIC" &&
      /(?:thuc hien duoc|nhan biet duoc|neu duoc|dat|chua dat|quan sat)/.test(n)
    )
      type = /quan sat/.test(n) ? "OBSERVATION" : "PERFORMANCE";
    if (!type) continue;
    let prompt = text
      .replace(/^[-•]\s*/, "")
      .replace(
        /^(?:GV|Giáo viên)\s+(?:đặt câu hỏi|hỏi|nêu câu hỏi)\s*[:：]\s*/iu,
        "",
      );
    const duplicate = out.find(
      (q) =>
        norm(q.prompt) === norm(prompt) &&
        sameScope(source, q) &&
        questionSegments.get(q.id) === segment,
    );
    if (duplicate) {
      duplicate.sources.push(source);
      duplicate.duplicateCount++;
      last = duplicate;
      continue;
    }
    const number = prompt.match(/^(?:câu\s*)?(\d+)[.):]\s*/iu)?.[1];
    const q = assessmentSchema.parse({
      id:
        "assessment-" +
        hash(
          [
            source.blockId,
            source.tableIndex,
            source.row,
            source.column,
            source.paragraph,
            norm(prompt),
          ].join("|"),
        ),
      type,
      prompt,
      number,
      choices: [],
      answer: null,
      answerCandidates: [],
      feedback: "",
      sources: [source],
      activityId: source.activityId,
      periodId: source.periodId,
      context,
      confidence: type === "SHORT_ANSWER" ? 0.7 : 0.85,
      reviewStatus: "NEEDS_TEACHER_REVIEW",
      duplicateCount: 0,
      teacherEdited: false,
    });
    questionSegments.set(q.id, segment);
    positions.set(q.id, sourcePosition(source));
    out.push(q);
    last = q;
  }
  for (const p of pending) {
    const scoped = out.filter(
      (q) => sameScope(p.source, q) && questionSegments.get(q.id) === p.segment,
    );
    let candidates = p.number
      ? scoped.filter((q) => q.number === p.number)
      : scoped.filter((q) =>
          q.sources.some(
            (s) => s.blockId === p.source.blockId && s.row === p.source.row,
          ),
        );
    if (!p.number && candidates.length !== 1) {
      const before = scoped.filter(
        (q) => (positions.get(q.id) ?? -1) <= sourcePosition(p.source),
      );
      const nearest = before.at(-1);
      candidates = nearest ? [nearest] : [];
      if (
        p.source.row !== undefined &&
        out.filter(
          (q) =>
            sameScope(p.source, q) &&
            q.sources.some(
              (s) => s.blockId === p.source.blockId && s.row === p.source.row,
            ),
        ).length > 1
      )
        p.explicit = false;
    }
    if (candidates.length !== 1) continue;
    const q = candidates[0];
    q.answerCandidates.push({
      text: p.source.sourceText,
      value: p.value,
      source: p.source,
      status:
        p.explicit && keyValid(q, p.value)
          ? "SOURCE_VERIFIED"
          : "NEEDS_TEACHER_REVIEW",
    });
  }
  for (const q of out) {
    if (q.answerCandidates.length) {
      const values = new Set(q.answerCandidates.map((c) => norm(c.value)));
      q.answer = {
        ...q.answerCandidates[0],
        status:
          values.size === 1
            ? q.answerCandidates[0].status
            : "NEEDS_TEACHER_REVIEW",
      };
    }
  }
  return out.sort(
    (x, y) => sourcePosition(x.sources[0]) - sourcePosition(y.sources[0]),
  );
}
export function updateAssessment(
  original: Assessment,
  patch: Partial<
    Pick<
      Assessment,
      "type" | "prompt" | "choices" | "reviewStatus" | "feedback"
    >
  > & { answerText?: string },
): Assessment {
  const { answerText, ...changes } = patch;
  const q = assessmentSchema.parse({
    ...original,
    ...changes,
    teacherEdited: true,
  });
  if (answerText !== undefined)
    q.answer = answerText.trim()
      ? {
          text: answerText,
          value: answerText,
          source: original.sources[0],
          status: "TEACHER_CONFIRMED",
        }
      : null;
  if (
    patch.type !== undefined ||
    patch.prompt !== undefined ||
    patch.choices !== undefined ||
    answerText !== undefined ||
    patch.feedback !== undefined
  )
    q.reviewStatus = "NEEDS_TEACHER_REVIEW";
  if (q.reviewStatus === "READY" && !canConfirmAssessment(q))
    q.reviewStatus = "NEEDS_TEACHER_REVIEW";
  return q;
}
export function canConfirmAssessment(q: Assessment) {
  return (
    ["OBSERVATION", "PERFORMANCE"].includes(q.type) ||
    !!(
      q.answer &&
      q.answer.status !== "NEEDS_TEACHER_REVIEW" &&
      keyValid(q, q.answer.value)
    )
  );
}
export function scoredAssessments(a: PedagogicalAnalysis) {
  return (a.assessments ?? []).filter(
    (q) =>
      q.reviewStatus === "READY" &&
      !["OBSERVATION", "PERFORMANCE"].includes(q.type) &&
      q.answer &&
      q.answer.status !== "NEEDS_TEACHER_REVIEW" &&
      keyValid(q, q.answer.value),
  );
}
/** Student content is an allowlist: original source and teacher answer candidates never cross this boundary. */
export function studentAssessment(q: Assessment, submitted = false) {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    choices: q.choices,
    ...(submitted && q.reviewStatus === "READY"
      ? { answer: q.answer?.value ?? null, feedback: q.feedback }
      : {}),
  };
}
/** Preserve the original teacher analysis while filtering its learner-generation input. No source quiz is auto-published. */
export function generationSafeAnalysis(
  a: PedagogicalAnalysis,
): PedagogicalAnalysis {
  if (!a.assessments?.length) return a;
  const draft = structuredClone(a);
  const sourceNorm = (s: string) =>
    norm(s)
      .replace(/^[-•*–]\s*/, "")
      .replace(/^(?:cau\s*)?(?:[a-d]|\d+)[.):]\s*/i, "");
  const blocked = a.assessments
    .filter((q) => q.reviewStatus !== "READY")
    .flatMap((q) => q.sources.map((s) => sourceNorm(s.sourceText)));
  const answers = a.assessments.flatMap((q) =>
    q.answerCandidates.map((c) => sourceNorm(c.source.sourceText)),
  );
  const clean = (texts: string[]) =>
    texts
      .flatMap((text) => text.split("\n"))
      .map((text) =>
        text
          .replace(/\s+(?:đáp án(?:\s+câu\s*\d+)?|GV chốt)\s*[:：].*$/iu, "")
          .trim(),
      )
      .filter((text) => {
        const n = sourceNorm(text);
        return (
          !!n &&
          !/^(?:dap an|ket qua|hs (?:du kien )?tra loi|gv chot|giai thich|phan hoi)\s*[:：]/.test(
            n,
          ) &&
          !blocked.some((b) => b === n || b.replace(/^[-•*–]\s*/, "") === n) &&
          !answers.some((b) => b === n || b.replace(/^[-•*–]\s*/, "") === n)
        );
      });
  draft.assessmentEvidence = clean(draft.assessmentEvidence);
  draft.teachingActivities = draft.teachingActivities.map((t) => ({
    ...t,
    content: clean(t.content),
    studentActivity: clean(t.studentActivity),
    teacherActivity: clean(t.teacherActivity),
    goals: clean(t.goals),
    products: clean(t.products),
    organization: clean(t.organization),
  }));
  return draft;
}
