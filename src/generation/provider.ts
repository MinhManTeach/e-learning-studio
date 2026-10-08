import {
  lessonBlueprintSchema,
  type BlueprintSlide,
  type LessonBlueprint,
} from "../blueprint/model";
import { parseProject, slideSchema, type Slide } from "../model/schema";
import { stageLabels } from "../model/analysis";
import type {
  LessonGenerationContext,
  LessonGenerationProvider,
} from "./model";
import { learnerGoal, learnerText, narration, shortPoints } from "./language";
import { questionFor, questionLevels } from "./questions";
import { sourceQuestion } from "./sourceQuestions";

export class DeterministicLessonGenerationProvider implements LessonGenerationProvider {
  async generate(input: LessonBlueprint, context: LessonGenerationContext) {
    const b = lessonBlueprintSchema.parse(input);
    if (b.periodSelectionRequired && !b.periodReview)
      throw new Error("Cần xác nhận lựa chọn tiết trước khi tạo bài.");
    const tick = async (n: number) => {
      context.onProgress?.(n);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    await tick(0);
    const prefix = context.projectId;
    const assets: {
      id: string;
      kind: "IMAGE" | "AUDIO" | "VIDEO";
      sourceType: "LIBRARY";
      name: string;
      url: string;
      altText: string;
    }[] = [];
    const slides: Slide[] = b.proposedSlides.map((s, i) => {
      const m = s.mediaIntent;
      const requested = !!m && m.type !== "NONE";
      const assetId = `${prefix}:media:${s.id}`;
      if (requested)
        assets.push({
          id: assetId,
          kind:
            m.type === "AUDIO"
              ? "AUDIO"
              : m.type === "VIDEO"
                ? "VIDEO"
                : "IMAGE",
          sourceType: "LIBRARY",
          name: "Cần học liệu · " + s.title,
          url: "",
          altText: m.visualDescription || m.purpose,
        });
      return slideSchema.parse({
        id: `${prefix}:slide:${s.id}`,
        type: s.type.toLowerCase(),
        title: s.title,
        stepNumber: i + 1,
        stepName: stageLabels[s.stage],
        pedagogicalStage: s.stage,
        estimatedMinutes: s.estimatedMinutes,
        layout:
          s.type === "WELCOME" || s.type === "COMPLETION"
            ? "CENTERED"
            : "TEXT_ONLY",
        media: {
          enabled: false,
          assetId: requested ? assetId : null,
          suggestion: requested
            ? [
                `Loại: ${m.type}`,
                `Bắt buộc: ${m.required ? "Có" : "Không"}`,
                `Mục đích: ${m.purpose}`,
                `Mô tả: ${m.visualDescription ?? ""}`,
                `Từ khóa: ${m.searchQuery ?? ""}`,
                `Mô tả thay thế: ${m.visualDescription || m.purpose}`,
              ].join("\n")
            : "",
        },
        teacherNotes:
          `Mục đích: ${s.pedagogicalPurpose}\nYêu cầu nguồn: ${s.sourceOutcomeIds.join(", ")}` +
          (b.periodReview
            ? `\nTiết nguồn được chọn: ${b.periodReview.selectedPeriodIds.join(", ")}\nThời lượng xác nhận: ${b.periodReview.periodCount} × ${b.periodReview.minutesPerPeriod} = ${b.periodReview.totalDurationMinutes} phút\nTiết trang (đề xuất): ${s.plannedPeriodId ?? "chưa gắn"}`
            : ""),
        sourceContext: s.sourceContext,
        data: initialData(s),
      });
    });
    await tick(1);
    // Content and objectives are derived from current slide outlines. Context is
    // used for canonical objective metadata and ID checks, never to replace edits.
    slides.forEach((slide, i) => {
      const points = shortPoints(b.proposedSlides[i].contentOutline);
      if (slide.type === "welcome")
        slide.data = {
          body: "Chúng mình cùng khám phá và thử sức trong bài học này.",
          paragraphs: [],
          bulletPoints: points,
          keywords: [],
          keyTakeaway: "Em có thể học từng bước và thử lại khi cần.",
        };
      if (slide.type === "content")
        slide.data = {
          body: points[0] ?? "",
          paragraphs: [],
          bulletPoints: points.slice(1),
          keywords: [],
          keyTakeaway:
            b.proposedSlides[i].interactionIntent?.type !== "NONE"
              ? "Em thử thực hiện và giải thích cách làm của mình."
              : "Hãy liên hệ ý chính với một ví dụ em biết.",
        };
      if (slide.type === "objectives")
        slide.data = {
          learningOutcomes: points.map(learnerGoal),
          keyMessages: ["Sau bài học, em có thể:"],
          icons: [],
        };
      if (slide.type === "summary")
        slide.data = {
          keyMessages: points,
          mindMapNodes: [],
          safetyTips: [],
          helpChannels: [],
        };
      if (slide.type === "completion")
        slide.data = {
          message:
            "Em đã đi hết bài học. Hãy xem kết quả bên dưới, ôn lại những ý cần củng cố và thử lại bài kiểm tra khi cần.",
          reviewLabel: "Ôn lại bài",
          retryLabel: "Làm lại bài kiểm tra",
        };
    });
    await tick(2);
    slides.forEach((slide, i) => {
      const source = b.proposedSlides[i];
      const points = shortPoints(source.contentOutline);
      if (slide.type === "warmup") {
        slide.data = {
          scored: false,
          question: points[0] || "Em liên hệ chủ đề này với trải nghiệm nào?",
          instruction: source.interactionIntent?.description
            ? `${learnerText(source.interactionIntent.description)}. Chọn một cách chia sẻ và nêu ví dụ của em.`
            : "Chọn một cách chia sẻ rồi giải thích bằng một ví dụ của em.",
          items: [
            "Em đã gặp một ví dụ liên quan",
            "Em muốn tìm hiểu thêm một ví dụ",
          ].map((label, n) => ({
            id: `${slide.id}:warmup:${n}`,
            label,
            icon: "",
            isValid: true,
            feedback:
              n === 0
                ? "Em hãy kể ví dụ và nói điều em muốn biết rõ hơn."
                : "Em hãy nêu điều muốn tìm hiểu; cùng đối chiếu trong bài học.",
          })),
        };
        if (source.sourceActivityIds?.length) {
          slide.data.instruction =
            points.slice(1).join(" ") ||
            "Thực hiện nhiệm vụ rồi tự nhận xét mức độ tham gia của em.";
          slide.data.items = [
            "Em đã thực hiện nhiệm vụ",
            "Em cần giáo viên hỗ trợ",
          ].map((label, n) => ({
            id: `${slide.id}:participation:${n}`,
            label,
            icon: "",
            isValid: true,
            feedback:
              n === 0
                ? "Em hãy chia sẻ cách làm của mình."
                : "Em hãy trao đổi phần cần hỗ trợ với giáo viên.",
          }));
        }
      }
      if (slide.type === "scenario") {
        const principle = points.join(" ");
        const responsibility = /chịu trách nhiệm/iu.test(principle);
        slide.data = {
          character: "Em và một người bạn",
          context: "Cùng thực hiện nhiệm vụ học tập",
          situation: `Một bạn cần chọn cách làm cho nhiệm vụ mới. Nội dung cần dựa vào là: ${principle}`,
          question: "Em sẽ giúp bạn lựa chọn như thế nào?",
          choices: [
            {
              text: "Đối chiếu cách làm với nội dung trên, rồi giải thích lựa chọn của mình.",
              isRecommended: true,
              feedback: `Cách này giúp em dựa vào nguyên tắc: ${principle}`,
              consequence:
                "Em có căn cứ để giải thích và tự kiểm tra lựa chọn.",
            },
            {
              text: "Chọn cách làm nhanh nhất mà chưa kiểm tra có phù hợp nội dung trên không.",
              isRecommended: false,
              feedback:
                "Làm nhanh chưa giúp em biết lựa chọn có phù hợp hay không. Hãy đối chiếu với nội dung đã học.",
              consequence: "Em còn thiếu căn cứ để giải thích lựa chọn.",
            },
            {
              text: "Để bạn quyết định toàn bộ, rồi dùng kết quả mà không tìm hiểu lý do.",
              isRecommended: false,
              feedback:
                "Em cần hiểu lý do của lựa chọn và chịu trách nhiệm về phần mình sử dụng.",
              consequence:
                "Em khó giải thích vì sao cách làm phù hợp với nhiệm vụ.",
            },
          ].map((c, n) => ({
            ...c,
            id: `${slide.id}:choice:${n}`,
            label: String.fromCharCode(65 + n),
          })),
          allowRetry: true,
        };
        if (responsibility) {
          slide.data.situation = `Một bạn nhận được gợi ý từ Internet hoặc AI và muốn dùng ngay cho bài làm. Em nhớ nguyên tắc: ${principle}`;
          slide.data.question = "Em khuyên bạn làm gì trước khi sử dụng gợi ý?";
          slide.data.choices[0].text =
            "Xem xét gợi ý, chọn thông tin phù hợp và chịu trách nhiệm với phần mình sử dụng.";
          slide.data.choices[1].text =
            "Dùng nguyên gợi ý vì công cụ sẽ chịu trách nhiệm thay mình.";
          slide.data.choices[2].text =
            "Nhờ bạn chọn hộ rồi sử dụng mà không tìm hiểu lý do.";
        }
      }
    });
    await tick(3);
    const quizIndexes = slides.flatMap((s, i) =>
      s.type === "quiz" ? [i] : [],
    );
    const count = b.assessmentPlan.targetQuestionCount;
    const eligible = b.assessmentPlan.coverage.flatMap((c) => {
      const supportedSlides = b.proposedSlides.filter(
        (s) =>
          c.slideIds.includes(s.id) && s.sourceOutcomeIds.includes(c.outcomeId),
      );
      const source =
        supportedSlides.find((s) => s.type === "QUIZ") ?? supportedSlides[0];
      return source ? [{ source, outcomeId: c.outcomeId }] : [];
    });
    if (b.sourceAssessments) {
      slides.forEach((slide, i) => {
        if (slide.type !== "quiz") return;
        slide.data.questions = (
          b.proposedSlides[i].sourceAssessmentIds ?? []
        ).map((id) => {
          const item = b.sourceAssessments!.find((q) => q.id === id);
          const question = item && sourceQuestion(item, prefix);
          if (!question)
            throw new Error(
              "Câu hỏi nguồn chưa được duyệt hoặc không tương thích.",
            );
          return question;
        });
      });
    }
    for (let n = 0; !b.sourceAssessments && n < count; n++) {
      const coverage = eligible.length
        ? eligible[n % eligible.length]
        : undefined;
      const sourceIndex = coverage
        ? b.proposedSlides.findIndex(
            (s) => s.id === coverage.source.id && s.type === "QUIZ",
          )
        : -1;
      const index =
        n < quizIndexes.length
          ? quizIndexes[n]
          : quizIndexes.includes(sourceIndex)
            ? sourceIndex
            : quizIndexes[n % quizIndexes.length];
      const quiz = slides[index];
      if (!quiz || quiz.type !== "quiz")
        throw new Error("Kế hoạch đánh giá cần trang câu hỏi tương thích.");
      const source = b.proposedSlides[index];
      const outcomePosition = coverage
        ? source.sourceOutcomeIds.indexOf(coverage.outcomeId)
        : -1;
      const local = (
        outcomePosition >= 0 || !coverage ? source : coverage.source
      ).contentOutline.filter((x) => x.trim());
      const principle =
        local[(outcomePosition >= 0 ? outcomePosition : n) % local.length] ||
        source.title;
      const coveredLevel = questionLevels(
        b.assessmentPlan,
        coverage?.outcomeId ?? "",
        n,
      );
      const repeat = Math.floor(n / Math.max(1, eligible.length));
      const levels = [
        coveredLevel,
        ...(["RECOGNITION", "UNDERSTANDING", "APPLICATION"] as const).filter(
          (l) => l !== coveredLevel,
        ),
      ];
      const question = questionFor(
        principle,
        levels[repeat % levels.length],
        n,
        prefix,
        b.assessmentPlan.recommendedQuestionTypes.includes("TRUE_FALSE") &&
          n % 3 === 1,
      );
      quiz.data.questions.push(question);
      quiz.teacherNotes += `\n${question.id}: ${coverage?.outcomeId ?? source.sourceOutcomeIds.join(", ")}`;
    }
    slides.forEach((s) => {
      if (s.type === "quiz") {
        s.data.title = s.title;
        s.data.instructions =
          "Đọc kỹ từng tình huống, chọn đáp án và xem lời giải thích sau khi nộp bài.";
        s.data.passingScore = b.assessmentPlan.targetPassingScore;
      }
    });
    await tick(4);
    slides.forEach((s, i) => {
      s.voiceScript = narration(
        s.title,
        shortPoints(b.proposedSlides[i].contentOutline),
        ["warmup", "scenario", "quiz"].includes(s.type),
      );
      s.narration = {
        mode:
          b.proposedSlides[i].narrationIntent?.enabled === false
            ? "NONE"
            : "BROWSER_TTS",
        text: s.voiceScript,
        lang: "vi-VN",
      };
      s.accessibility.transcript = s.voiceScript;
      if (b.accessibilityPlan.sourceSupport.length)
        s.accessibility.fontScale = 1.15;
    });
    await tick(5);
    return parseProject({
      schemaVersion: "2.2",
      projectId: prefix,
      createdAt: context.now,
      updatedAt: context.now,
      metadata: {
        projectTitle: b.title,
        subject: b.subject ?? "",
        curriculumGrade: String(b.curriculumGrade ?? ""),
        targetAudienceGrade: String(b.targetAudienceGrade ?? ""),
        grade: String(b.targetAudienceGrade ?? ""),
        durationMinutes: Math.round(b.estimatedDurationMinutes),
      },
      objectives: {
        curriculumOutcomes: context.outcomes.map((o) => o.text),
        specialNeeds: b.accessibilityPlan.sourceSupport.join("\n"),
      },
      settings: {
        passingScore: b.assessmentPlan.targetPassingScore,
        requireQuiz: count > 0,
      },
      slides,
      assets,
    });
  }
}
function initialData(s: BlueprintSlide) {
  if (s.type === "SCENARIO")
    return {
      choices: [
        { id: "initial-a", isRecommended: true },
        { id: "initial-b", isRecommended: false },
      ],
    };
  return {};
}
