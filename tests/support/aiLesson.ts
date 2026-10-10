// A small imported lesson for the "AI làm đẹp" tests: a cover page, a page with
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
  illustrationStyle: "Bright flat illustration for children.",
  slides: [
    {
      id: "s-cover",
      title: "Khám phá",
      bulletPoints: ["Không dùng"],
      keyTakeaway: "Không dùng",
      voiceScript: "Các em cùng khám phá nhé!",
      teacherOnly: [],
      pictureAlt: "Chữ Khám phá nhiều màu",
      illustration: "",
      explanations: [],
    },
    {
      id: "s-posture",
      title: "Hoạt động 1: Khởi động",
      bulletPoints: ["Ngồi lưng thẳng, vai thả lỏng."],
      keyTakeaway: "Ngồi đúng tư thế giúp em khoẻ mạnh.",
      voiceScript: "Các em hãy ngồi thẳng lưng nhé.",
      teacherOnly: [
        "Kiểm tra tư thế: HS ngồi vào vị trí máy tính",
        "Nhắc HS ngồi ngay ngắn.",
      ],
      pictureAlt: "Bạn nhỏ ngồi đúng tư thế trước máy tính",
      illustration: "A boy sitting at a computer",
      explanations: [],
    },
    {
      id: "s-steps",
      title: "5 thao tác cơ bản với chuột",
      bulletPoints: ["Di chuyển chuột để thay đổi vị trí con trỏ."],
      keyTakeaway: "",
      voiceScript: "Có năm thao tác với chuột.",
      teacherOnly: [],
      pictureAlt: "",
      illustration: "A child's hand moving a computer mouse on a desk",
      explanations: [],
    },
    {
      id: "s-quiz",
      title: "Luyện tập",
      bulletPoints: [],
      keyTakeaway: "",
      voiceScript: "",
      teacherOnly: [],
      pictureAlt: "",
      illustration: "",
      explanations: [
        {
          questionId: "q1",
          explanation: "Tắt bằng Start giúp máy lưu dữ liệu.",
        },
        { questionId: "q2", explanation: "Không được ghi đè." },
      ],
    },
  ],
};
