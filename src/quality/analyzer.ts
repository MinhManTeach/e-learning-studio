import { parseProject, type LessonProject, type Slide } from "../model/schema";
import { instructionalText } from "../generation/validation";
import { learnerText, shortPoints } from "../generation/language";

export interface QualityIssue {
  severity: "WARNING" | "INFO";
  slideId: string | null;
  issueCode: string;
  explanation: string;
  suggestedAction: string;
}
export interface ApprovedSource {
  outcomes: string[];
  bySlide: Record<string, string[]>;
}
export interface ImprovementProposal {
  id: string;
  kind: "OBJECTIVES" | "CONTENT" | "SPLIT" | "LAYOUT";
  slideId: string;
  before: string;
  explanation: string;
  replacements: Slide[];
}
const normalized = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("vi")
    .replace(/[.!?:;…]+$/u, "");
export function uniqueObjectives(lines: string[]) {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = normalized(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function wordCount(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}
export function recommendLayout(slide: Slide, hasImage: boolean) {
  const words = wordCount(instructionalText(slide).join(" "));
  const choiceCount =
    slide.type === "scenario"
      ? slide.data.choices.length
      : slide.type === "warmup"
        ? slide.data.items.length
        : slide.type === "quiz"
          ? slide.data.questions.reduce((n, q) => n + q.options.length, 0)
          : 0;
  const interactive = slide.type === "quiz" || choiceCount > 2;
  return {
    layout: !hasImage
      ? ["welcome", "completion"].includes(slide.type)
        ? ("CENTERED" as const)
        : ("TEXT_ONLY" as const)
      : interactive || words > 160
        ? ("TEXT_ONLY" as const)
        : ("TEXT_LEFT_MEDIA_RIGHT" as const),
    explanation: !hasImage
      ? "Chưa có ảnh: dùng toàn bộ chiều rộng cho nội dung."
      : interactive
        ? "Ưu tiên chiều rộng cho câu hỏi và các lựa chọn; ảnh vẫn được giữ trong bài."
        : words > 160
          ? "Nhiều chữ: nên tách ý trước khi bố trí ảnh cạnh chữ."
          : "Ảnh và nội dung ngắn có thể đặt cạnh nhau, giữ nguyên tỉ lệ ảnh.",
  };
}
export function analyzeLessonQuality(
  project: LessonProject,
  source?: ApprovedSource,
) {
  const issues: QualityIssue[] = [];
  const add = (
    issueCode: string,
    slideId: string | null,
    explanation: string,
    suggestedAction: string,
    severity: QualityIssue["severity"] = "WARNING",
  ) =>
    issues.push({ issueCode, slideId, explanation, suggestedAction, severity });
  const texts = project.slides.map((s) => instructionalText(s).join(" "));
  const all = normalized(texts.join(" "));
  if (!source)
    add(
      "SOURCE_UNAVAILABLE",
      null,
      "Bài đã lưu không chứa toàn bộ kịch bản nguồn đã duyệt; chưa thể xác nhận tính chính xác hoặc độ phủ nguồn.",
      "Đối chiếu KHBD/kịch bản đã duyệt. Không coi kiểm tra từ khóa là xác nhận kiến thức.",
      "INFO",
    );
  else
    for (const outcome of source.outcomes) {
      const words = normalized(outcome)
        .split(" ")
        .filter((w) => w.length > 3);
      if (
        words.length &&
        words.filter((w) => all.includes(w)).length / words.length < 0.6
      )
        add(
          "OUTCOME_COVERAGE",
          null,
          `Chưa tìm thấy đủ dấu hiệu nội dung cho: ${outcome}`,
          "Giáo viên đối chiếu yêu cầu nguồn và bổ sung hoạt động phù hợp.",
        );
    }
  if (source)
    for (const [slideId, lines] of Object.entries(source.bySlide)) {
      const target = project.slides.find((s) => s.id === slideId);
      if (!target) continue;
      const content = instructionalText(target).join(" ");
      for (const code of new Set(
        lines.join(" ").match(/\b\d+\.[A-Z]\d+\.\d+\b/g) ?? [],
      )) {
        if (!content.includes(code))
          add(
            "SOURCE_PRINCIPLE_MISSING",
            slideId,
            `Chưa thấy mã nguyên tắc ${code} từ outline đã duyệt.`,
            "Đối chiếu và giữ nguyên ý nghĩa nguyên tắc nguồn; không tự thêm nguyên tắc khác.",
          );
      }
    }
  let discovered = false;
  const previous = new Map<string, string>();
  project.slides.forEach((s, i) => {
    const text = texts[i];
    const words = wordCount(text);
    if (words > 150)
      add(
        "TEXT_DENSITY",
        s.id,
        `Trang có khoảng ${words} từ hiển thị trước phản hồi. Đây là ngưỡng gợi ý biên tập, không phải điểm chất lượng học tập.`,
        "Tách ý hoặc dùng trình bày từng bước; giữ nguyên nội dung và đáp án.",
      );
    const key = normalized(text);
    if (key && previous.has(key))
      add(
        "REPEATED_CONTENT",
        s.id,
        "Nội dung trùng một trang trước.",
        "Kiểm tra mục đích ôn tập trước khi bỏ trùng.",
      );
    previous.set(key, s.id);
    if (/\b(?:GV|HS)\b|giáo viên tổ chức|yêu cầu cần đạt/iu.test(text))
      add(
        "LEARNER_LANGUAGE",
        s.id,
        "Có dấu hiệu văn phong hành chính hoặc hướng dẫn dành cho giáo viên.",
        "Chuyển thành lời hướng dẫn cho em, đối chiếu nghĩa với nguồn.",
      );
    const grade = Number(
      project.metadata.targetAudienceGrade || project.metadata.grade,
    );
    if (
      grade > 0 &&
      grade <= 5 &&
      text.split(/[.!?\n]/).some((t) => wordCount(t) > 40)
    )
      add(
        "LEARNER_SUITABILITY",
        s.id,
        "Có câu dài hơn 40 từ trong bài dành cho học sinh tiểu học.",
        "Chia câu theo ý; giáo viên xác nhận mức độ phù hợp.",
      );
    if (s.type === "content" || s.pedagogicalStage === "DISCOVERY")
      discovered = true;
    if (
      !discovered &&
      (s.type === "scenario" || s.pedagogicalStage === "PRACTICE")
    )
      add(
        "ACTIVITY_SEQUENCE",
        s.id,
        "Hoạt động luyện tập xuất hiện trước phần khám phá/ví dụ.",
        "Kiểm tra chủ ý sư phạm; cân nhắc giới thiệu ví dụ trước.",
      );
    if (s.type === "content" && !s.data.keyTakeaway.trim())
      add(
        "INTERACTION",
        s.id,
        "Trang nội dung chưa có lời gợi mở hoặc ý chốt.",
        "Thêm câu hỏi liên hệ dựa trên nguồn, tránh thêm kiến thức chưa duyệt.",
        "INFO",
      );
    if (
      (s.type === "scenario" &&
        s.data.choices.some(
          (c) => !c.feedback.trim() || !c.consequence.trim(),
        )) ||
      (s.type === "quiz" && s.data.questions.some((q) => !q.explanation.trim()))
    )
      add(
        "FEEDBACK",
        s.id,
        "Một số lựa chọn/câu hỏi thiếu giải thích hoặc hệ quả.",
        "Bổ sung lý do đúng/chưa đúng; giữ nguyên đáp án và điểm.",
      );
    if (
      (s.type === "scenario" &&
        s.data.choices.some((c) => wordCount(c.text) > 28)) ||
      (s.type === "quiz" &&
        s.data.questions.some((q) =>
          q.options.some((o) => wordCount(o.text) > 28),
        ))
    )
      add(
        "ANSWER_DENSITY",
        s.id,
        "Một số lựa chọn dài hơn 28 từ.",
        "Giáo viên rút gọn nhãn mà không đổi nghĩa hoặc đáp án.",
      );
    if (
      s.type === "objectives" &&
      uniqueObjectives(s.data.learningOutcomes).length !==
        s.data.learningOutcomes.length
    )
      add(
        "OBJECTIVE_DUPLICATION",
        s.id,
        "Mục tiêu bị lặp hoặc có dòng trống.",
        "Xem trước và duyệt loại bỏ bản trùng chính xác.",
      );
    if (s.media.enabled) {
      const asset = project.assets.find((a) => a.id === s.media.assetId);
      if (!asset || !asset.url)
        add(
          "MEDIA_REFERENCE",
          s.id,
          "Tham chiếu ảnh chưa có nội dung tải được.",
          "Tải/gắn lại ảnh qua thư viện hiện tại.",
        );
      if (asset && !asset.altText.trim())
        add(
          "ACCESSIBILITY_ALT",
          s.id,
          "Ảnh chưa có mô tả thay thế.",
          "Mô tả ngắn nội dung ảnh liên quan bài học.",
        );
      add(
        "IMAGE_RELEVANCE_REVIEW",
        s.id,
        "Metadata/giấy phép không chứng minh ảnh phù hợp nội dung hoặc lứa tuổi.",
        "Giáo viên xem ảnh thực tế, alt text và ghi công trước khi dùng.",
        "INFO",
      );
      if (asset?.sourceType === "LIBRARY" && !s.media.caption.trim())
        add(
          "IMAGE_CREDIT",
          s.id,
          "Ảnh thư viện chưa có ghi công trên trang.",
          "Khôi phục tác giả, giấy phép và nguồn từ bản ghi media.",
        );
    }
    if (!s.accessibility.transcript.trim() && !s.narration.text.trim())
      add(
        "ACCESSIBILITY_TRANSCRIPT",
        s.id,
        "Chưa có văn bản thuyết minh/transcript.",
        "Thêm transcript tương đương nội dung trang.",
        "INFO",
      );
    const approved = source?.bySlide[s.id];
    if (approved?.length) {
      const tokens = normalized(approved.join(" "))
        .split(" ")
        .filter((w) => w.length > 3);
      const overlap = tokens.filter((w) => normalized(text).includes(w)).length;
      if (tokens.length && overlap / tokens.length < 0.6)
        add(
          "SOURCE_REVIEW",
          s.id,
          "Nội dung lệch dấu hiệu từ ngữ so với outline đã duyệt; chưa thể kết luận đúng/sai bằng heuristic.",
          "Đối chiếu từng khẳng định với nguồn đã duyệt.",
        );
    }
  });
  const estimatedMinutes = project.slides.reduce(
    (n, s) => n + (s.estimatedMinutes ?? 0),
    0,
  );
  if (estimatedMinutes > project.metadata.durationMinutes)
    add(
      "TIME_BUDGET",
      null,
      `Tổng thời gian trang ${estimatedMinutes} phút vượt ngân sách ${project.metadata.durationMinutes} phút.`,
      "Điều chỉnh hoạt động/thời lượng qua duyệt của giáo viên.",
    );
  if (project.slides.some((s) => s.estimatedMinutes === undefined))
    add(
      "TIME_UNCERTAIN",
      null,
      "Một số trang chưa có thời lượng; tổng hiện tại chưa đầy đủ.",
      "Ước lượng thời gian đọc, tương tác và phản hồi.",
      "INFO",
    );
  return { issues, estimatedMinutes };
}
export function proposeImprovements(
  project: LessonProject,
): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];
  for (const s of project.slides) {
    const add = (
      kind: ImprovementProposal["kind"],
      explanation: string,
      replacements: Slide[],
    ) =>
      proposals.push({
        id: `${s.id}:${kind}`,
        kind,
        slideId: s.id,
        before: JSON.stringify(s),
        explanation,
        replacements,
      });
    if (s.type === "objectives") {
      const after = structuredClone(s);
      after.title = "Hôm nay em sẽ…";
      const indices = s.data.learningOutcomes.map((line, i) => ({ line, i }));
      const unique = uniqueObjectives(s.data.learningOutcomes);
      after.data.learningOutcomes = unique;
      after.data.icons = s.data.icons.length
        ? unique.map(
            (line) =>
              s.data.icons[indices.find((x) => x.line === line)!.i] ?? "",
          )
        : [];
      after.data.keyMessages = uniqueObjectives(s.data.keyMessages).filter(
        (m) => normalized(m) !== normalized(after.title),
      );
      if (JSON.stringify(after) !== JSON.stringify(s))
        add(
          "OBJECTIVES",
          "Đặt tiêu đề rõ ràng, giữ nguyên nghĩa và thứ tự mục tiêu, bỏ dòng trùng chính xác.",
          [after],
        );
    }
    if (s.type === "content" && s.narration.mode !== "AUDIO_ASSET") {
      const after = structuredClone(s);
      after.data.body = learnerText(s.data.body);
      after.data.paragraphs = shortPoints(s.data.paragraphs);
      after.data.bulletPoints = shortPoints(s.data.bulletPoints);
      if (
        normalized(after.data.body) === normalized(s.title) &&
        (after.data.paragraphs.length || after.data.bulletPoints.length)
      )
        after.data.body = "";
      if (JSON.stringify(after.data) !== JSON.stringify(s.data))
        add(
          "CONTENT",
          "Bỏ lời dẫn/trùng tiêu đề và chuyển hướng dẫn hành chính sang lời cho em. Đối chiếu trước/sau để giữ nghĩa; không thêm ví dụ hay yêu cầu mới.",
          [after],
        );
    }
    if (
      s.type === "content" &&
      s.narration.mode !== "AUDIO_ASSET" &&
      wordCount(instructionalText(s).join(" ")) > 150 &&
      project.slides.length < 30 &&
      (s.estimatedMinutes ?? 0) >= 2
    ) {
      const parts = [
        s.data.body,
        ...s.data.paragraphs,
        ...s.data.bulletPoints,
      ].filter(Boolean);
      if (parts.length > 1) {
        const midpoint = Math.ceil(parts.length / 2);
        const first = structuredClone(s),
          second = structuredClone(s);
        first.data.body = parts[0];
        first.data.paragraphs = [];
        first.data.bulletPoints = parts.slice(1, midpoint);
        second.id = `${s.id}:split:${crypto.randomUUID()}`;
        second.title += " — tiếp theo";
        second.data.body = parts[midpoint];
        second.data.paragraphs = [];
        second.data.bulletPoints = parts.slice(midpoint + 1);
        first.estimatedMinutes = s.estimatedMinutes! / 2;
        second.estimatedMinutes = s.estimatedMinutes! - first.estimatedMinutes;
        first.data.keyTakeaway = "";
        // Preserve media on the original only. References, captions and binary records are never rewritten.
        second.media = { ...second.media, enabled: false };
        second.layout = "TEXT_ONLY";
        for (const page of [first, second]) {
          page.voiceScript = [
            page.data.body,
            ...page.data.bulletPoints,
            page.data.keyTakeaway,
          ]
            .filter(Boolean)
            .join("\n");
          page.narration.text = page.voiceScript;
          page.accessibility.transcript = page.voiceScript;
        }
        add(
          "SPLIT",
          "Chia các ý nguồn thành hai trang liên tiếp, không thêm kiến thức/ví dụ và giữ tổng thời gian. Giáo viên kiểm tra ý chốt.",
          [first, second],
        );
      }
    }
    const asset = project.assets.find((a) => a.id === s.media.assetId);
    const layout = recommendLayout(s, !!(s.media.enabled && asset?.url));
    // Never propose hiding an enabled image merely to reduce density.
    if (
      layout.layout !== s.layout &&
      !(s.media.enabled && layout.layout === "TEXT_ONLY")
    )
      add("LAYOUT", layout.explanation, [
        { ...structuredClone(s), layout: layout.layout },
      ]);
  }
  return proposals;
}
export function applyProposal(
  project: LessonProject,
  proposal: ImprovementProposal,
) {
  if (
    proposal.kind === "SPLIT" &&
    project.slides.length - 1 + proposal.replacements.length > 30
  )
    throw new Error(
      "Đề xuất vượt giới hạn 30 trang. Hãy phân tích lại kịch bản.",
    );
  const current = project.slides.find((s) => s.id === proposal.slideId);
  if (!current || JSON.stringify(current) !== proposal.before)
    throw new Error(
      "Trang đã thay đổi. Hãy phân tích lại để giữ chỉnh sửa của giáo viên.",
    );
  const slides = project.slides.flatMap((s) =>
    s.id === proposal.slideId ? proposal.replacements : [s],
  );
  return parseProject({
    ...project,
    slides:
      proposal.kind === "SPLIT"
        ? slides.map((s, i) => ({ ...s, stepNumber: i + 1 }))
        : slides,
  });
}
