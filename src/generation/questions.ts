import type { Question } from "../model/schema";
import type { AssessmentPlan } from "../blueprint/model";
import { learnerGoal } from "./language";

// Questions assess how to use a confirmed principle. Distractors describe common
// learning strategies, not invented subject facts or negated source assertions.
export function questionFor(
  principle: string,
  level: Question["level"],
  index: number,
  prefix: string,
  trueFalse = false,
): Question {
  const idea = learnerGoal(principle).replace(/[.!?]+$/, "");
  const information = /thông tin|tìm kiếm|nguồn|internet/iu.test(idea);
  const responsibility = /chịu trách nhiệm/iu.test(idea);
  const prompts = {
    RECOGNITION: `Nội dung nào phù hợp với điều em đang học: “${idea}”?`,
    UNDERSTANDING: `Một bạn muốn giải thích ý “${idea}”. Cách nào giúp bạn hiểu rõ hơn?`,
    APPLICATION: `Khi làm một nhiệm vụ mới liên quan đến “${idea}”, em chọn cách nào?`,
  };
  let correct =
    level === "RECOGNITION"
      ? `Dựa vào ý “${idea}” để nhận biết ví dụ phù hợp.`
      : level === "UNDERSTANDING"
        ? "Đối chiếu ý đã học với một ví dụ và giải thích mối liên hệ."
        : "Dựa vào ý đã học, thử cách làm và kiểm tra xem có phù hợp nhiệm vụ không.";
  if (information) {
    prompts.RECOGNITION = `Em đang cần giải quyết một vấn đề. Cách nào phù hợp với ý “${idea}”?`;
    prompts.UNDERSTANDING = `Hai bạn tìm được những thông tin khác nhau cho cùng một nhiệm vụ. Dựa vào ý “${idea}”, vì sao cần xem xét trước khi sử dụng?`;
    prompts.APPLICATION = `Em tìm được một gợi ý trên mạng cho nhiệm vụ của mình. Dựa vào ý “${idea}”, em làm gì tiếp theo?`;
    correct =
      level === "UNDERSTANDING"
        ? "Để chọn thông tin có liên quan và giải thích vì sao phù hợp với nhiệm vụ."
        : "Xem thông tin có liên quan đến vấn đề cần giải quyết rồi chọn phần phù hợp.";
  }
  if (responsibility) {
    prompts.APPLICATION =
      "Một công cụ AI gợi ý cách giải quyết nhiệm vụ. Ai quyết định chọn thông tin và chịu trách nhiệm về cách sử dụng?";
    correct =
      "Em xem xét, chọn lọc và chịu trách nhiệm với thông tin mình sử dụng.";
  }
  const choices = [
    correct,
    responsibility
      ? "Công cụ AI chịu toàn bộ trách nhiệm nên em dùng nguyên gợi ý."
      : information
        ? "Dùng ngay kết quả đầu tiên vì đó là cách nhanh nhất."
        : "Làm theo một ví dụ bất kỳ mà chưa đối chiếu với nội dung đã học.",
    responsibility
      ? "Người khác quyết định thay em; em không cần tìm hiểu thông tin."
      : information
        ? "Chọn thông tin trình bày đẹp, dù chưa biết có liên quan đến nhiệm vụ không."
        : "Chỉ ghi nhớ tên hoạt động rồi chuyển sang nhiệm vụ khác.",
  ];
  const correctAnswerIndex = index % (trueFalse ? 2 : 3);
  const ordered = trueFalse
    ? ["Đúng", "Sai"]
    : choices.map(
        (_, i) =>
          choices[(i - correctAnswerIndex + choices.length) % choices.length],
      );
  const prompt = trueFalse
    ? `Một bạn ${correctAnswerIndex === 0 ? "đối chiếu nội dung đã học trước khi chọn cách làm" : "chọn cách làm trước rồi bỏ qua việc đối chiếu nội dung đã học"}. Cách học đó có giúp vận dụng ý “${idea}” không?`
    : prompts[level];
  return {
    id: `${prefix}:question:${index + 1}`,
    level,
    prompt,
    options: ordered.map((text, i) => ({
      id: `${prefix}:question:${index + 1}:option:${i + 1}`,
      text,
    })),
    correctAnswerIndex,
    explanation: `Ý cần dựa vào là: ${idea}. Đối chiếu với ví dụ hoặc nhiệm vụ giúp em giải thích lựa chọn; chỉ nhớ tên hoạt động chưa đủ.`,
    points: 10,
  };
}
export function questionLevels(
  plan: AssessmentPlan,
  outcomeId: string,
  index: number,
): Question["level"] {
  return (
    plan.coverage.find((c) => c.outcomeId === outcomeId)?.level ??
    (["RECOGNITION", "UNDERSTANDING", "APPLICATION"] as const)[index % 3]
  );
}
