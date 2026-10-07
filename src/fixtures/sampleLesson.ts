import { createProject, createSlide } from "../model/factories";
import {
  parseProject,
  type Question,
  type Slide,
  type SlideType,
} from "../model/schema";
export function createSampleProject() {
  const p = createProject("Tin học 4 — Thông tin trên Website");
  p.projectId = "sample-tinhoc-phase1";
  p.createdAt = p.updatedAt = "2026-10-07T00:00:00.000Z";
  p.metadata = {
    ...p.metadata,
    subject: "Tin học",
    grade: "4",
    curriculumGrade: "4",
    targetAudienceGrade: "5",
    topic: "Thông tin trên Website",
    durationMinutes: 35,
    curriculum: "GDPT 2018",
  };
  p.objectives = {
    ...p.objectives,
    knowledge: [
      "Nhận biết thông tin trên website.",
      "Biết lựa chọn website phù hợp.",
    ],
    aiIntegration: {
      code: "4.B2.1",
      title: "Bảo vệ thông tin cá nhân",
      description:
        "Không tự cung cấp thông tin riêng tư hoặc không cần thiết; khi chưa chắc, hỏi người lớn tin cậy.",
    },
  };
  const types: SlideType[] = [
    "welcome",
    "objectives",
    "warmup",
    "content",
    "content",
    "content",
    "content",
    "content",
    "scenario",
    "scenario",
    "quiz",
    "quiz",
    "summary",
    "completion",
  ];
  const titles = [
    "Chào mừng đến bài học",
    "Sau bài học, em làm được gì?",
    "Em nhìn thấy gì trên trang web?",
    "Thông tin dạng văn bản",
    "Thông tin dạng hình ảnh",
    "Thông tin dạng âm thanh",
    "Siêu văn bản và siêu liên kết",
    "Website phù hợp với em và bảo vệ thông tin cá nhân",
    "Tình huống: Em vừa “trúng quà”?",
    "Tình huống: Chatbot hỏi chuyện riêng tư",
    "Thử tài của em – Vòng 1",
    "Thử tài của em – Vòng 2",
    "Cẩm nang lướt web an toàn",
    "Hoàn thành bài học",
  ];
  p.slides = types.map((t, i) => ({
    ...createSlide(t),
    id: `sample-slide-${i + 1}`,
    title: titles[i],
    voiceScript: titles[i],
    estimatedMinutes: i === 10 || i === 11 ? 4 : 2,
  }));
  const welcome = p.slides[0];
  if (welcome.type === "welcome")
    welcome.data = {
      ...welcome.data,
      body: "Chào mừng em đến với hành trình khám phá thế giới số!",
      bulletPoints: [
        "Quan sát thông tin trên website.",
        "Thực hành lựa chọn an toàn.",
      ],
      keyTakeaway: "Khi chưa chắc, dừng lại và hỏi người lớn tin cậy.",
    };
  const goals = p.slides[1];
  if (goals.type === "objectives")
    goals.data = {
      learningOutcomes: [
        "Nhận biết văn bản, hình ảnh, âm thanh và siêu liên kết.",
        "Chọn website phù hợp với lứa tuổi.",
        "Biết xử lý yêu cầu thông tin riêng tư bất thường.",
      ],
      keyMessages: ["Cùng quan sát, suy nghĩ và thực hành!"],
      icons: ["①", "②", "③"],
    };
  const warm = p.slides[2];
  if (warm.type === "warmup")
    warm.data = {
      scored: false,
      question: "Những gì có thể xuất hiện trên website?",
      instruction: "Chọn từng mục để khám phá.",
      items: [
        {
          id: "warm-text",
          label: "Chữ viết",
          icon: "✎",
          isValid: true,
          feedback: "Văn bản giúp em đọc và tìm hiểu kiến thức.",
        },
        {
          id: "warm-sound",
          label: "Âm thanh",
          icon: "♫",
          isValid: true,
          feedback: "Website có thể phát nhạc hoặc lời nói.",
        },
        {
          id: "warm-smell",
          label: "Mùi hương",
          icon: "❀",
          isValid: false,
          feedback: "Màn hình không truyền được mùi hương.",
        },
      ],
    };
  const bodies = [
    "Văn bản gồm chữ cái, con số và dấu câu. Tiêu đề giúp em biết nội dung chính.",
    "Hình ảnh minh họa giúp em quan sát và ghi nhớ. Hãy chọn hình phù hợp với bài học.",
    "Âm thanh có thể là lời nói, bản nhạc hoặc tiếng động. Điều chỉnh âm lượng để không làm phiền người khác.",
    "Siêu văn bản có thể chứa văn bản, hình ảnh, âm thanh và siêu liên kết. Liên kết đưa em tới một vị trí hoặc trang khác.",
    "Ưu tiên website phù hợp lứa tuổi và có hướng dẫn của thầy cô. Không tự cung cấp thông tin riêng tư, không cần thiết cho website hoặc chatbot; nếu chưa chắc, hỏi người lớn tin cậy.",
  ];
  p.slides.slice(3, 8).forEach((s, i) => {
    if (s.type === "content")
      s.data = {
        ...s.data,
        body: bodies[i],
        keywords: i === 3 ? ["Siêu văn bản", "Siêu liên kết"] : [],
        keyTakeaway: "Quan sát cẩn thận và lựa chọn phù hợp.",
      };
  });
  const scenario = (s: Slide, chat: boolean) => {
    if (s.type !== "scenario") return;
    s.data = {
      character: chat ? "Bạn Mai" : "Bạn Huy",
      context: "Khi đang học trên mạng",
      situation: chat
        ? "Một chatbot vừa giúp em học, rồi hỏi địa chỉ nhà và số điện thoại bố mẹ để gửi quà."
        : "Một website bất ngờ báo em trúng quà, yêu cầu số điện thoại bố mẹ và mã xác minh.",
      question: "Em nên xử lý thế nào?",
      allowRetry: true,
      choices: [
        {
          id: s.id + "-A",
          label: "A",
          text: "Cung cấp ngay thông tin được hỏi.",
          isRecommended: false,
          feedback:
            "Thông tin này không cần thiết cho việc học. Em nên dừng lại.",
          consequence: "Thông tin có thể bị sử dụng ngoài ý muốn.",
        },
        {
          id: s.id + "-B",
          label: "B",
          text: chat
            ? "Không cung cấp; chỉ hỏi chuyện học tập và báo người lớn nếu yêu cầu bất thường."
            : "Đóng thông báo, không cung cấp gì và báo người lớn tin cậy.",
          isRecommended: true,
          feedback: "Em đã lựa chọn thận trọng và biết tìm sự hỗ trợ.",
          consequence:
            "Giúp bảo vệ thông tin của gia đình và tiếp tục học an toàn.",
        },
        {
          id: s.id + "-C",
          label: "C",
          text: "Chia sẻ đường dẫn cho các bạn cùng thử.",
          isRecommended: false,
          feedback: "Không nên chuyển tiếp yêu cầu đáng ngờ cho người khác.",
          consequence: "Các bạn có thể gặp yêu cầu không phù hợp tương tự.",
        },
        {
          id: s.id + "-D",
          label: "D",
          text: "Nhập thông tin giả để thử.",
          isRecommended: false,
          feedback: "Không cần thử một yêu cầu đáng ngờ. Hãy hỏi người lớn.",
          consequence:
            "Thử tiếp có thể khiến em gặp thêm nội dung hoặc yêu cầu không phù hợp.",
        },
      ],
    };
  };
  scenario(p.slides[8], false);
  scenario(p.slides[9], true);
  const prompts = [
    [
      "Loại thông tin nào gồm chữ cái và con số?",
      "Văn bản",
      "Hình ảnh",
      "Âm thanh",
      "Mùi hương",
    ],
    [
      "Ảnh minh họa thuộc dạng thông tin nào?",
      "Hình ảnh",
      "Âm thanh",
      "Mật khẩu",
      "Mùi vị",
    ],
    [
      "Tiếng nói trên website thuộc dạng thông tin nào?",
      "Âm thanh",
      "Màu sắc",
      "Địa chỉ nhà",
      "Văn bản in",
    ],
    [
      "Siêu liên kết giúp em làm gì?",
      "Đi tới vị trí hoặc trang khác",
      "Ngửi mùi",
      "Tự nhập mật khẩu",
      "Làm sáng bàn phím",
    ],
    [
      "Vì sao bài học kết hợp chữ và ảnh?",
      "Giúp nội dung rõ và trực quan",
      "Bắt buộc mọi trang phải có ảnh",
      "Che nội dung",
      "Chỉ để kéo dài bài",
    ],
    [
      "Website phù hợp với em là website nào?",
      "Phù hợp lứa tuổi, được thầy cô hướng dẫn",
      "Bất kỳ website có quà",
      "Website hỏi mã xác minh",
      "Website có nội dung đáng sợ",
    ],
    [
      "Vì sao không tự chia sẻ thông tin riêng tư?",
      "Thông tin có thể bị dùng ngoài ý muốn",
      "Vì không bao giờ được chia sẻ với ai",
      "Vì mọi website đều xấu",
      "Vì máy tính không nhận chữ",
    ],
    [
      "Chatbot hỏi địa chỉ nhà để gửi quà. Em làm gì?",
      "Không tự cung cấp và hỏi người lớn",
      "Gửi ngay",
      "Gửi số bố mẹ",
      "Rủ bạn gửi cùng",
    ],
    [
      "Thông báo trúng quà hỏi mã xác minh. Em làm gì?",
      "Đóng thông báo và báo người lớn",
      "Nhập mã ngay",
      "Nhập thông tin giả",
      "Chia sẻ đường dẫn",
    ],
    [
      "Thấy nội dung gây lo lắng. Em làm gì?",
      "Đóng nội dung và kể người lớn tin cậy",
      "Tiếp tục xem một mình",
      "Gửi cho cả lớp",
      "Giấu mọi người",
    ],
  ];
  const questions: Question[] = prompts.map((row, i) => ({
    id: `sample-question-${i + 1}`,
    level: i < 4 ? "RECOGNITION" : i < 7 ? "UNDERSTANDING" : "APPLICATION",
    prompt: row[0],
    options: row.slice(1).map((text, j) => ({ id: `q${i + 1}-o${j}`, text })),
    correctAnswerIndex: 0,
    explanation: row[1] + ". Đây là lựa chọn phù hợp với nội dung bài học.",
    points: 10,
  }));
  [10, 11].forEach((i, n) => {
    const s = p.slides[i];
    if (s.type === "quiz")
      s.data = {
        ...s.data,
        instructions: "Chọn một đáp án cho mỗi câu rồi nộp bài.",
        passingScore: 80,
        questions: questions.slice(n * 5, n * 5 + 5),
      };
  });
  const summary = p.slides[12];
  if (summary.type === "summary")
    summary.data = {
      keyMessages: ["DỪNG", "KIỂM TRA", "GIỮ KÍN", "BÁO NGƯỜI LỚN"],
      mindMapNodes: [],
      safetyTips: ["Khi chưa chắc, hỏi người lớn tin cậy."],
      helpChannels: [
        {
          id: "help-adult",
          label: "Người hỗ trợ",
          value: "Bố mẹ hoặc thầy cô",
          description: "Chia sẻ khi em gặp yêu cầu bất thường.",
          enabled: true,
        },
      ],
    };
  return parseProject(p);
}
