import { analysisSchema, type PedagogicalAnalysis } from "../import/model";
import { allocateTime, contentChunks, mapActivityStage } from "./design";
import {
  outcomeCatalog,
  type BlueprintSettings,
  type BlueprintSlide,
  type LessonBlueprint,
  type LessonBlueprintProvider,
} from "./model";
import {
  initialCoverage,
  refreshPlans,
  validateLessonBlueprint,
} from "./validation";

export class LessonBlueprintGenerator {
  constructor(
    private readonly provider: LessonBlueprintProvider = new DeterministicLessonBlueprintProvider(),
  ) {}
  async generate(draft: {
    analysis: PedagogicalAnalysis;
    confirmedAt: string | null;
  }) {
    if (!draft.confirmedAt)
      throw new Error(
        "Cần xác nhận bản phân tích trước khi xây dựng kịch bản.",
      );
    return this.provider.generate(analysisSchema.parse(draft.analysis));
  }
}
export class DeterministicLessonBlueprintProvider implements LessonBlueprintProvider {
  constructor(private readonly settings: BlueprintSettings = {}) {}
  async generate(input: PedagogicalAnalysis): Promise<LessonBlueprint> {
    const a = analysisSchema.parse(input);
    const outcomes = outcomeCatalog(a);
    const grade = Number(a.targetAudienceGrade || a.curriculumGrade) || 4;
    const knownDuration = a.durationMinutes !== null && a.durationMinutes > 0;
    const minutes = knownDuration
      ? a.durationMinutes!
      : Math.max(
          20,
          Math.min(
            45,
            15 + outcomes.length * 3 + a.teachingActivities.length * 2,
          ),
        );
    const slides: BlueprintSlide[] = [];
    const add = (
      type: BlueprintSlide["type"],
      stage: BlueprintSlide["stage"],
      title: string,
      purpose: string,
      outline: string[],
      refs: string[] = [],
      interaction: BlueprintSlide["interactionIntent"] = {
        type: "NONE",
        description: "",
      },
    ) => {
      const visual = ["CONTENT", "WARMUP", "SCENARIO"].includes(type);
      slides.push({
        id: `${a.id}:slide:${slides.length + 1}`,
        order: slides.length + 1,
        type,
        stage,
        title,
        pedagogicalPurpose: purpose,
        contentOutline: outline,
        sourceOutcomeIds: refs,
        estimatedMinutes: 1,
        interactionIntent: interaction,
        narrationIntent: {
          enabled: a.specialNeedsSupport.length > 0,
          purpose: "Hỗ trợ nghe nội dung và hướng dẫn tương tác",
        },
        mediaIntent: visual
          ? {
              type: "ILLUSTRATION",
              purpose: `Làm rõ ${title} qua hình ảnh để ${purpose.toLocaleLowerCase("vi")}`,
              visualDescription: `Minh họa ${a.subject || "bài học"} cho học sinh lớp ${grade}: ${outline[0] || title}. Một ý chính, dấu hiệu trực quan rõ, không chữ nhỏ.`,
              required: true,
            }
          : {
              type: "NONE",
              purpose: "Chỉ cần chữ ngắn và ký hiệu điều hướng",
              required: false,
            },
      });
    };
    add(
      "WELCOME",
      "OPENING",
      a.lessonTitle || "Cùng khám phá bài học",
      "Giúp em biết chủ đề và sẵn sàng tham gia",
      [a.topic || a.lessonTitle || "Giới thiệu chủ đề cùng giáo viên"],
    );
    add(
      "OBJECTIVES",
      "OPENING",
      "Hôm nay em sẽ…",
      "Định hướng điều em sẽ làm được",
      outcomes.length
        ? outcomes.map((o) => o.text)
        : ["Cùng giáo viên xác định mục tiêu bài học"],
    );
    const opening = a.teachingActivities.filter(
      (t) => mapActivityStage(t) === "OPENING",
    );
    if (opening.length)
      add(
        "WARMUP",
        "OPENING",
        opening[0].title,
        "Kết nối trải nghiệm đã có với chủ đề",
        opening[0].studentActivity.length
          ? opening[0].studentActivity.slice(0, 2)
          : opening[0].content.slice(0, 2).length
            ? opening[0].content.slice(0, 2)
            : ["Chia sẻ điều em đã biết về chủ đề"],
        [],
        {
          type: "SHORT_PRACTICE",
          description:
            "Nhớ lại và chia sẻ một trải nghiệm liên quan đến chủ đề",
        },
      );
    const capacity = grade <= 2 || minutes >= 40 ? 1 : minutes <= 30 ? 3 : 2;
    const knowledge = [...a.keyKnowledge, ...a.knowledgeObjectives];
    // Outcomes supply missing content, rather than copying teacher instructions.
    const chunks = contentChunks(
      knowledge.length ? knowledge : outcomes.map((o) => o.text),
      grade,
      capacity,
    );
    const assigned = new Set<string>();
    chunks.forEach((chunk, i) => {
      const refs = outcomes
        .filter((o) =>
          chunk.some(
            (text) => text === o.text || overlap(text, o.text) >= 0.35,
          ),
        )
        .map((o) => o.id);
      refs.forEach((id) => assigned.add(id));
      add(
        "CONTENT",
        "DISCOVERY",
        chunk[0].split(/[:.!?]/u)[0].slice(0, 90) || `Khám phá ${i + 1}`,
        "Giúp em hiểu một nhóm ý trọng tâm qua ví dụ trực quan",
        chunk,
        refs,
      );
    });
    for (const o of outcomes.filter((o) => !assigned.has(o.id)))
      add(
        "CONTENT",
        "DISCOVERY",
        `Khám phá: ${o.text.slice(0, 70)}`,
        "Làm rõ yêu cầu cần đạt chưa có trong nội dung trọng tâm",
        [o.text],
        [o.id],
      );
    const active = a.teachingActivities.filter(
      (t) => mapActivityStage(t) !== "OPENING",
    );
    for (const activity of active) {
      const stage = mapActivityStage(activity);
      if (!stage) continue;
      const source = activity.studentActivity.length
        ? activity.studentActivity
        : activity.content;
      if (
        !source.some((x) => x.trim()) &&
        !activity.goals.some((x) => x.trim())
      )
        continue;
      const outline = contentChunks(
        source.length ? source : activity.goals,
        grade,
        2,
      );
      // Teacher organization/products are evidence, not learner slide prose.
      for (const group of outline) {
        const refs = outcomes
          .filter((o) => group.some((text) => overlap(text, o.text) >= 0.25))
          .map((o) => o.id);
        const scenario = /tình huống|xử lý|lựa chọn|quyết định/u.test(
          group.join(" ").toLocaleLowerCase("vi"),
        );
        add(
          scenario ? "SCENARIO" : stage === "ASSESSMENT" ? "QUIZ" : "CONTENT",
          stage,
          activity.title,
          stage === "APPLICATION"
            ? "Chuyển kiến thức vào việc em làm trong đời sống"
            : "Em thực hiện và giải thích cách làm",
          group,
          refs,
          {
            type: scenario
              ? "SCENARIO"
              : stage === "ASSESSMENT"
                ? "MULTIPLE_CHOICE"
                : "SHORT_PRACTICE",
            description: scenario
              ? "Chọn cách xử lý và giải thích quyết định dựa trên kiến thức đã học"
              : "Thực hiện nhiệm vụ theo đề cương và chia sẻ cách làm",
          },
        );
      }
    }
    const integration = [
      ...a.aiIntegration,
      ...a.digitalCompetencyIntegration,
      ...a.safetyTopics,
    ].filter((x) => x.trim());
    if (integration.length) {
      const groups = contentChunks(integration, grade, 2);
      for (const group of groups) {
        const decision =
          /trách nhiệm|an toàn|bảo vệ|xử lý|lựa chọn|đáng tin/u.test(
            group.join(" ").toLocaleLowerCase("vi"),
          );
        const related = outcomes
          .filter((o) => group.some((text) => overlap(text, o.text) >= 0.2))
          .map((o) => o.id);
        add(
          decision ? "SCENARIO" : "CONTENT",
          "APPLICATION",
          decision
            ? "Em lựa chọn và giải thích"
            : "Áp dụng trong môi trường số",
          "Gắn nội dung tích hợp nguồn với hành động của học sinh",
          group,
          related,
          {
            type: decision ? "SCENARIO" : "SHORT_PRACTICE",
            description:
              "Vận dụng nguyên tắc trong đề cương vào một lựa chọn gần gũi; giải thích lý do",
          },
        );
      }
    }
    if (!slides.some((s) => s.interactionIntent?.type !== "NONE"))
      add(
        "CONTENT",
        "OPENING",
        "Em thử và chia sẻ",
        "Khuyến khích em chủ động tham gia",
        [
          a.lessonTitle
            ? `Nêu một ví dụ về ${a.lessonTitle}`
            : "Chia sẻ điều em muốn tìm hiểu với giáo viên",
        ],
        [],
        {
          type: "SHORT_PRACTICE",
          description: "Nêu một ví dụ hoặc điều em muốn tìm hiểu",
        },
      );
    const assess =
      outcomes.length > 0 || a.assessmentEvidence.some((x) => x.trim());
    if (assess) {
      // Chunk outcome references too: no single mega-quiz owns all objectives.
      const groups = outcomes.length
        ? Array.from({ length: Math.ceil(outcomes.length / 3) }, (_, i) =>
            outcomes.slice(i * 3, i * 3 + 3),
          )
        : [[]];
      groups.forEach((group, i) =>
        add(
          "QUIZ",
          "ASSESSMENT",
          groups.length > 1
            ? `Em kiểm tra điều đã học · ${i + 1}`
            : "Em kiểm tra điều đã học",
          "Kiểm tra mức đạt mục tiêu và phản hồi để em thử lại",
          group.length
            ? group.map((o) => o.text)
            : a.assessmentEvidence.slice(0, 3),
          group.map((o) => o.id),
          {
            type: "MULTIPLE_CHOICE",
            description:
              "Dự kiến câu hỏi nhận biết, giải thích và vận dụng phù hợp mục tiêu; chưa tạo câu hỏi cuối cùng",
          },
        ),
      );
    }
    add(
      "SUMMARY",
      "APPLICATION",
      "Điều em ghi nhớ",
      "Củng cố ý chính và kết nối các hoạt động",
      (a.keyKnowledge.length
        ? a.keyKnowledge
        : outcomes.map((o) => o.text)
      ).slice(0, 3).length
        ? (a.keyKnowledge.length
            ? a.keyKnowledge
            : outcomes.map((o) => o.text)
          ).slice(0, 3)
        : ["Cùng giáo viên nhắc lại điều đã khám phá"],
    );
    add(
      "COMPLETION",
      "APPLICATION",
      "Em đã hoàn thành!",
      "Ghi nhận nỗ lực và hướng dẫn bước tiếp theo",
      ["Tự nhìn lại điều em làm được và điều cần hỏi thêm"],
    );
    // Source analysis has no timestamps. A stable epoch keeps identical inputs exactly
    // reproducible; the workflow stamps actual creation/update times on its draft copy.
    const epoch = "2000-01-01T00:00:00.000Z";
    let b: LessonBlueprint = {
      version: "1.0",
      id: `${a.id}:blueprint:1`,
      sourceAnalysisId: a.id,
      title: a.lessonTitle || "Kịch bản bài học",
      subject: a.subject,
      ...(Number(a.curriculumGrade) > 0
        ? { curriculumGrade: Number(a.curriculumGrade) }
        : {}),
      targetAudienceGrade: grade,
      estimatedDurationMinutes: minutes,
      durationSource: knownDuration ? "SOURCE" : "PROPOSED",
      designRationale: `Nhóm ý theo khái niệm và tải đọc cho lớp ${grade}; ${minutes} phút. Giữ hoạt động có bằng chứng nguồn, xen kẽ thực hiện và phản hồi. Các giai đoạn là cách tổ chức của E-Learning Studio.`,
      stages: [],
      proposedSlides: allocateTime(slides, minutes),
      assessmentPlan: {
        assessmentNeeded: assess,
        targetQuestionCount: assess
          ? Math.max(
              3,
              Math.min(12, outcomes.length * 2 + (minutes >= 35 ? 2 : 0)),
            )
          : 0,
        targetPassingScore: this.settings.passingScore ?? 80,
        coverage: initialCoverage(a),
        recommendedQuestionTypes: assess
          ? ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_PRACTICE"]
          : [],
        rationale:
          "Phân bổ theo mục tiêu nhận biết, hiểu và vận dụng có trong nguồn; chưa tạo câu hỏi hoặc đáp án.",
      },
      mediaPlan: {
        requiredSlideIds: [],
        rationale:
          "Chỉ lập nhu cầu minh họa phục vụ mục đích học tập; chưa tìm kiếm hoặc tạo học liệu.",
      },
      accessibilityPlan: {
        sourceSupport: [...a.specialNeedsSupport],
        strategies: [
          "Câu ngắn, một ý chính mỗi trang",
          "Tín hiệu trực quan rõ và mô tả thay thế cho hình",
          "Không chỉ dùng màu để truyền đạt ý nghĩa",
          ...(a.specialNeedsSupport.length
            ? [
                "Có hướng dẫn bằng âm thanh và văn bản",
                "Không gây áp lực thời gian; cho phép thử lại",
                "Thao tác chọn lớn, không yêu cầu độ chính xác cao",
              ]
            : []),
        ],
      },
      warnings: [],
      createdAt: epoch,
      updatedAt: epoch,
    };
    b = refreshPlans(b);
    b.warnings = validateLessonBlueprint(b, a);
    if (!chunks.length)
      b.warnings.push({
        code: "MISSING_CONTENT",
        severity: "WARNING",
        message:
          "Nguồn chưa đủ nội dung học tập; thầy/cô cần bổ sung đề cương.",
      });
    const unmapped = active.filter((t) => !mapActivityStage(t));
    if (unmapped.length)
      b.warnings.push({
        code: "UNMAPPED_ACTIVITY",
        severity: "WARNING",
        message: `${unmapped.length} hoạt động chưa rõ giai đoạn; thầy/cô đối chiếu bản phân tích.`,
      });
    return b;
  }
}
function overlap(a: string, b: string) {
  const words = (text: string) =>
    text.toLocaleLowerCase("vi").match(/[\p{L}\p{N}]+/gu) ?? [];
  const aa = new Set(words(a));
  const bb = new Set(words(b));
  return (
    [...aa].filter((w) => bb.has(w)).length /
    Math.max(1, Math.min(aa.size, bb.size))
  );
}
