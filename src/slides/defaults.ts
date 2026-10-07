import { slideSchema, type SlideType, type Slide } from "../model/schema";
export const slideLabels = {
  welcome: "Trang mở đầu",
  objectives: "Mục tiêu bài học",
  warmup: "Khởi động",
  content: "Nội dung kiến thức",
  scenario: "Tình huống",
  quiz: "Câu hỏi trắc nghiệm",
  summary: "Tổng kết",
  completion: "Hoàn thành",
  legacy: "Hoạt động tham chiếu",
};
export function defaultQuestion() {
  return {
    id: crypto.randomUUID(),
    level: "RECOGNITION" as const,
    prompt: "Câu hỏi mới",
    options: ["A", "B", "C", "D"].map((text) => ({
      id: crypto.randomUUID(),
      text,
    })),
    correctAnswerIndex: 0,
    explanation: "",
    points: 10,
  };
}
export function defaultChoice(index: number) {
  return {
    id: crypto.randomUUID(),
    label: String.fromCharCode(65 + index),
    text: "Phương án " + (index + 1),
    isRecommended: index === 0,
    feedback: "Hãy suy nghĩ về cách xử lý này.",
    consequence: "",
  };
}
export function createDefaultSlide(type: SlideType): Slide {
  const data: Record<SlideType, unknown> = {
    welcome: {},
    content: {},
    objectives: {},
    warmup: {
      question: "Em hãy chọn và khám phá.",
      items: [
        {
          id: crypto.randomUUID(),
          label: "Lựa chọn đầu tiên",
          feedback: "Cảm ơn em đã chia sẻ!",
          isValid: true,
        },
      ],
    },
    scenario: {
      situation: "Một tình huống cần em giải quyết.",
      question: "Em sẽ làm gì?",
      choices: [defaultChoice(0), defaultChoice(1)],
    },
    quiz: { questions: [defaultQuestion()] },
    summary: {},
    completion: { message: "Cảm ơn em đã tham gia bài học!" },
  };
  const pedagogicalStage =
    type === "welcome" || type === "warmup"
      ? "OPENING"
      : type === "scenario"
        ? "PRACTICE"
        : type === "quiz"
          ? "ASSESSMENT"
          : type === "summary" || type === "completion"
            ? "APPLICATION"
            : "DISCOVERY";
  return slideSchema.parse({
    id: crypto.randomUUID(),
    type,
    title: type === "content" ? "Nội dung bài học" : slideLabels[type],
    layout: type === "welcome" ? "CENTERED" : "TEXT_ONLY",
    pedagogicalStage,
    data: data[type],
  });
}
