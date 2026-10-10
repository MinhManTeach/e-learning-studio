// A small imported lesson for the "AI thiết kế bài giảng" tests: a cover page, a page with
// a picture, a page without one, a quiz and the completion page.
import { createProject, createSlide } from "../../src/model/factories";
import { parseProject, type LessonProject } from "../../src/model/schema";

export function aiLesson(): LessonProject {
  const project = createProject("Bài 4 tiết 2");
  project.metadata = { ...project.metadata, subject: "Tin học", grade: "3" };
  const cover = createSlide("content");
  cover.id = "s-cover";
  cover.title = "Trang 12";
  cover.layout = "MEDIA_COVER";
  cover.media = { ...cover.media, enabled: true, assetId: "pic-cover" };
  const posture = createSlide("content");
  posture.id = "s-posture";
  posture.title = "HOẠT ĐỘNG 1: KHỞI ĐỘNG";
  posture.pedagogicalStage = "OPENING";
  posture.data.bulletPoints = [
    "* Kiểm tra tư thế: HS ngồi vào vị trí máy tính",
    "Lưng thẳng, vai thả lỏng.",
  ];
  posture.teacherNotes = "Nhắc HS ngồi ngay ngắn.";
  posture.layout = "TEXT_LEFT_MEDIA_RIGHT";
  posture.media = { ...posture.media, enabled: true, assetId: "pic-boy" };
  const steps = createSlide("content");
  steps.id = "s-steps";
  steps.title = "5 THAO TÁC CƠ BẢN VỚI CHUỘT";
  steps.data.bulletPoints = ["1. Di chuyển: Thay đổi vị trí."];
  const quiz = createSlide("quiz");
  quiz.id = "s-quiz";
  quiz.title = "Câu hỏi";
  quiz.data.questions = [
    {
      id: "q1",
      level: "RECOGNITION",
      prompt: "Thao tác nào đúng khi tắt máy tính?",
      options: [
        { id: "o1", text: "Rút phích cắm điện." },
        { id: "o2", text: "Chọn Start > Power > Shut down." },
      ],
      correctAnswerIndex: 1,
      explanation: "",
      points: 10,
    },
    {
      id: "q2",
      level: "RECOGNITION",
      prompt: "Kéo thả dùng để làm gì?",
      options: [
        { id: "o3", text: "Di chuyển biểu tượng" },
        { id: "o4", text: "Tắt máy" },
      ],
      correctAnswerIndex: 0,
      explanation: "Giáo viên đã giải thích.",
      points: 10,
    },
  ];
  const done = createSlide("completion");
  done.id = "s-done";
  project.slides = [cover, posture, steps, quiz, done];
  project.assets = ["pic-cover", "pic-boy"].map((id) => ({
    id,
    kind: "IMAGE" as const,
    sourceType: "UPLOAD" as const,
    name: id,
    fileName: `${id}.png`,
    mimeType: "image/png",
    size: 100,
    url: `local-media:${id}`,
    altText: "",
    status: "LOCAL" as const,
  }));
  return parseProject(project);
}

export const aiPlan = {
  pages: [
    {
      id: "s-cover",
      title: "Khám phá",
      design: "KEEP",
      intro: "",
      center: "",
      groups: [],
      items: [],
      keyTakeaway: "",
      voiceScript: "Các em cùng khám phá nhé!",
      teacherOnly: [],
    },
    {
      id: "s-posture",
      title: "Ngồi đúng tư thế",
      design: "COMPARE",
      intro: "Em hãy so sánh.",
      center: "",
      groups: ["Nên", "Không nên"],
      items: [
        { title: "Lưng thẳng", text: "Vai thả lỏng", group: 0 },
        { title: "Cúi sát màn hình", text: "Hại mắt", group: 1 },
      ],
      keyTakeaway: "Ngồi thẳng lưng khi dùng máy tính.",
      voiceScript: "Các em hãy ngồi thẳng lưng nhé.",
      teacherOnly: ["Kiểm tra tư thế: HS ngồi vào vị trí máy tính"],
    },
    {
      id: "s-steps",
      title: "5 thao tác với chuột",
      design: "steps",
      intro: "",
      center: "",
      groups: [],
      items: [
        { title: "Di chuyển", text: "Thay đổi vị trí con trỏ", group: 0 },
        { title: "Nháy chuột", text: "Nhấn nút trái 1 lần", group: 0 },
      ],
      keyTakeaway: "",
      voiceScript: "",
      teacherOnly: [],
    },
    {
      id: "s-quiz",
      title: "Luyện tập",
      design: "STEPS",
      intro: "",
      center: "",
      groups: [],
      items: [
        { title: "a", text: "", group: 0 },
        { title: "b", text: "", group: 0 },
      ],
      keyTakeaway: "",
      voiceScript: "",
      teacherOnly: [],
    },
  ],
  activities: [
    {
      afterId: "s-steps",
      type: "ORDER",
      title: "Sắp xếp các bước tắt máy",
      instruction: "Kéo các bước theo đúng thứ tự.",
      groups: [],
      items: [
        { text: "Nháy Start", match: "", group: 0 },
        { text: "Chọn Power", match: "", group: 0 },
        { text: "Chọn Shut down", match: "", group: 0 },
      ],
      questions: [],
    },
    {
      afterId: "s-posture",
      type: "TRUE_FALSE",
      title: "Đúng hay sai?",
      instruction: "",
      groups: [],
      items: [],
      questions: [
        {
          prompt: "Mắt nên cách màn hình 50–80 cm.",
          options: ["Đúng", "Sai"],
          correct: 0,
          explanation: "Khoảng cách này bảo vệ mắt.",
        },
      ],
    },
    {
      afterId: "s-posture",
      type: "SCENARIO",
      title: "Bạn An ngồi học",
      instruction: "",
      groups: [],
      items: [],
      questions: [],
      scenario: {
        character: "An",
        situation: "An cúi sát màn hình.",
        question: "An nên làm gì?",
        choices: [
          {
            text: "Ngồi thẳng lưng",
            isRecommended: true,
            feedback: "Đúng rồi.",
          },
          { text: "Cúi sát hơn", isRecommended: false, feedback: "Hại mắt." },
        ],
      },
    },
    {
      afterId: "invented-page",
      type: "MATCH",
      title: "Không có trang",
      instruction: "",
      groups: [],
      items: [{ text: "a", match: "b", group: 0 }],
      questions: [],
    },
    {
      afterId: "s-steps",
      type: "SORT",
      title: "Thiếu nhóm",
      instruction: "",
      groups: ["Chỉ một"],
      items: [
        { text: "a", match: "", group: 0 },
        { text: "b", match: "", group: 1 },
      ],
      questions: [],
    },
  ],
  explanations: [
    { questionId: "q1", explanation: "Tắt bằng Start giúp máy lưu dữ liệu." },
    { questionId: "q2", explanation: "Không được ghi đè." },
  ],
};
