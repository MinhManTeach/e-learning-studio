import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { LessonProject } from "../model/schema";
import type { StoredMedia } from "../media/model";
import {
  activityLabels,
  applyDesign,
  designLabels,
  designPlanSchema,
  answerSuggestions,
  redesigns,
  retitles,
  usableActivities,
  type DesignPlan,
} from "./design";
import { lessonRequest, pictureAssets, type LessonImage } from "./request";
import "./ai-studio.css";

export interface StudioMedia {
  get(assetId: string, projectId: string): Promise<StoredMedia | undefined>;
}
interface Status {
  provider: string;
  configured: boolean;
  model: string;
  imageModel: string;
  images: boolean;
}
const providerName = (p: string) => (p === "anthropic" ? "Claude" : "Gemini");
/** Pictures bigger than this are not sent to the AI (it still sees the page text). */
const maxPictureBytes = 1_500_000;

const messages: Record<string, string> = {
  AI_CONFIGURATION:
    "Khoá API chưa đúng hoặc chưa được cấp quyền. Kiểm tra LESSON_AI_API_KEY trong tệp .env.local rồi khởi động lại npm run dev.",
  AI_MODEL:
    "Không tìm thấy mô hình AI. Kiểm tra LESSON_AI_MODEL và LESSON_AI_IMAGE_MODEL trong tệp .env.local.",
  AI_RATE_LIMIT:
    "Khoá API đã hết lượt dùng tạm thời (giới hạn tốc độ hoặc hạn mức). Đợi một lúc rồi thử lại.",
  AI_TIMEOUT: "AI trả lời quá lâu. Hãy thử lại.",
  AI_BILLING:
    "Tài khoản AI chưa có tín dụng. Claude: nạp tín dụng tại console.anthropic.com → Plans & Billing. Gemini: bật Billing cho dự án của khoá trong Google AI Studio.",
  AI_BUSY:
    "Dịch vụ AI đang quá tải (nhiều người dùng cùng lúc). Hãy thử lại sau ít phút.",
  AI_NETWORK: "Không kết nối được tới dịch vụ AI. Kiểm tra mạng rồi thử lại.",
  AI_REQUEST:
    "Dịch vụ AI không nhận yêu cầu này. Nếu lỗi lặp lại, hãy thử đổi LESSON_AI_MODEL.",
  AI_TOO_LONG: "Bài quá dài cho một lần làm. Hãy bỏ bớt trang rồi thử lại.",
  AI_REFUSED: "AI từ chối hoặc dừng giữa chừng. Hãy thử lại.",
  AI_INVALID_RESPONSE: "AI trả lời chưa đúng dạng. Hãy thử lại.",
  AI_NO_IMAGE: "AI không vẽ được tranh cho trang này.",
  AI_NO_IMAGE_KEY:
    "Vẽ tranh cần khoá Gemini (dòng LESSON_AI_GEMINI_KEY trong .env.local).",
};
const explain = (code: string) =>
  messages[code] ?? "Chưa dùng được AI lúc này. Bài giảng vẫn được giữ nguyên.";

class AiError extends Error {}
async function post(fetcher: typeof fetch, path: string, body: unknown) {
  let response: Response;
  try {
    response = await fetcher(`/api/lesson-ai/studio/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiError("AI_NETWORK");
  }
  const value = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) throw new AiError(value.error ?? "AI_UNAVAILABLE");
  return value as unknown;
}
async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
async function pagePictures(project: LessonProject, media: StudioMedia) {
  const images = new Map<string, LessonImage>();
  for (const { slideId, asset } of pictureAssets(project)) {
    const stored = await media
      .get(asset.id, project.projectId)
      .catch(() => undefined);
    if (
      stored &&
      stored.size <= maxPictureBytes &&
      /^image\/(png|jpeg|webp)$/.test(stored.mimeType)
    )
      images.set(slideId, {
        mimeType: stored.mimeType,
        data: await toBase64(stored.blob),
      });
  }
  return images;
}

type Phase =
  | { step: "intro" }
  | { step: "working"; label: string }
  | { step: "review"; plan: DesignPlan }
  | { step: "done"; pages: number; activities: number };

/**
 * "AI thiết kế bài giảng": one AI call proposes card designs for knowledge pages
 * and new practice activities; the teacher picks; nothing changes until "Áp dụng".
 */
export function AiStudio({
  project,
  media,
  apply,
  onClose,
  fetcher = fetch,
}: {
  project: LessonProject;
  media: StudioMedia;
  apply: (project: LessonProject) => void;
  onClose: () => void;
  fetcher?: typeof fetch;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "intro" });
  const [error, setError] = useState("");
  const [pages, setPages] = useState<Set<string>>(new Set());
  const [activities, setActivities] = useState<Set<number>>(new Set());
  // Suggested answers start unticked: the teacher confirms each one.
  const [answers, setAnswers] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState(true);
  useEffect(() => {
    let live = true;
    fetcher("/api/lesson-ai/studio/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Status) => live && setStatus(s))
      .catch(
        () =>
          live &&
          setStatus({
            provider: "",
            configured: false,
            model: "",
            imageModel: "",
            images: false,
          }),
      );
    return () => {
      live = false;
    };
  }, [fetcher]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase.step !== "working") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose, phase.step]);

  async function propose() {
    setError("");
    setPhase({ step: "working", label: "Đang chuẩn bị ảnh các trang…" });
    try {
      const request = lessonRequest(
        project,
        await pagePictures(project, media),
      );
      setPhase({
        step: "working",
        label: `AI đang thiết kế ${request.slides.length} trang (thường mất 30–90 giây)…`,
      });
      const plan = designPlanSchema.parse(
        await post(fetcher, "design", request),
      );
      setPages(new Set(redesigns(project, plan).map((p) => p.id)));
      setActivities(new Set(usableActivities(project, plan).map((_, i) => i)));
      setPhase({ step: "review", plan });
    } catch (e) {
      setError(
        explain(e instanceof AiError ? e.message : "AI_INVALID_RESPONSE"),
      );
      setPhase({ step: "intro" });
    }
  }
  function confirm(plan: DesignPlan) {
    try {
      apply(applyDesign(project, plan, { pages, activities, titles, answers }));
      setPhase({
        step: "done",
        pages: pages.size,
        activities: activities.size,
      });
    } catch {
      setError(explain("AI_INVALID_RESPONSE"));
    }
  }

  const busy = phase.step === "working";
  return (
    <div className="modal-overlay">
      <div
        className="modal ai-studio"
        role="dialog"
        aria-modal="true"
        aria-label="AI thiết kế bài giảng"
      >
        <div className="ai-head">
          <h2>
            <Sparkles size={22} /> AI thiết kế bài giảng
          </h2>
          <button aria-label="Đóng" disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {!status ? (
          <p>Đang kiểm tra kết nối AI…</p>
        ) : !status.configured ? (
          <div className="ai-setup">
            <p>Chưa kết nối AI. Cách bật trên máy của thầy cô:</p>
            <ol>
              <li>
                Lấy khoá API: Claude tại console.anthropic.com (API keys), hoặc
                Gemini tại aistudio.google.com (Get API key).
              </li>
              <li>
                Trong thư mục dự án, tạo tệp <code>.env.local</code> với một
                dòng:
                <pre>{`LESSON_AI_API_KEY=khoá-của-thầy-cô`}</pre>
              </li>
              <li>
                Tắt rồi chạy lại <code>npm run dev</code>, mở lại bài giảng.
              </li>
            </ol>
            <p className="hint">
              Khoá chỉ nằm trên máy này, không được lưu vào bài giảng hay gửi
              lên GitHub.
            </p>
          </div>
        ) : phase.step === "intro" || phase.step === "working" ? (
          <>
            <p>
              AI đọc toàn bộ bài (chữ và ảnh các trang) rồi đề xuất trong một
              lần:
            </p>
            <ul>
              <li>
                <strong>Trình bày lại trang kiến thức</strong>: các bước có số,
                hai cột Nên / Không nên, dòng thời gian, sơ đồ tư duy, thẻ lật.
              </li>
              <li>
                <strong>Hoạt động luyện tập mới</strong>: sắp xếp thứ tự, phân
                loại, nối cặp, Đúng/Sai, trắc nghiệm, tình huống — đặt ngay sau
                trang có nội dung đó.
              </li>
            </ul>
            <p className="hint">
              Chỉ dùng kiến thức có trong bài. Thầy cô chọn từng mục trước khi
              áp dụng; trang cũ và đáp án cũ được giữ nguyên. Dùng khoá{" "}
              {providerName(status.provider)} ({status.model}), một lần gọi cho
              cả bài.
            </p>
            <div className="modal-actions">
              <button disabled={busy} onClick={onClose}>
                Để sau
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void propose()}
              >
                {phase.step === "working" ? phase.label : "Bắt đầu"}
              </button>
            </div>
          </>
        ) : phase.step === "review" ? (
          <Review
            project={project}
            plan={phase.plan}
            pages={pages}
            setPages={setPages}
            activities={activities}
            setActivities={setActivities}
            titles={titles}
            setTitles={setTitles}
            answers={answers}
            setAnswers={setAnswers}
            cancel={() => setPhase({ step: "intro" })}
            confirm={() => confirm(phase.plan)}
          />
        ) : (
          <>
            <p role="status">
              Đã trình bày lại {phase.pages} trang và thêm {phase.activities}{" "}
              hoạt động. Nếu chưa ưng, bấm “Hoàn tác cải thiện” trên thanh công
              cụ.
            </p>
            <div className="modal-actions">
              <button className="primary" onClick={onClose}>
                Xong
              </button>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}

const toggle = <T,>(set: Set<T>, value: T, on: boolean) => {
  const next = new Set(set);
  if (on) next.add(value);
  else next.delete(value);
  return next;
};

function Review({
  project,
  plan,
  pages,
  setPages,
  activities,
  setActivities,
  titles,
  setTitles,
  answers,
  setAnswers,
  cancel,
  confirm,
}: {
  project: LessonProject;
  plan: DesignPlan;
  pages: Set<string>;
  setPages: (s: Set<string>) => void;
  activities: Set<number>;
  setActivities: (s: Set<number>) => void;
  titles: boolean;
  setTitles: (on: boolean) => void;
  answers: Set<string>;
  setAnswers: (s: Set<string>) => void;
  cancel: () => void;
  confirm: () => void;
}) {
  const suggested = answerSuggestions(project, plan);
  const designed = redesigns(project, plan);
  const usable = usableActivities(project, plan);
  const renamed = retitles(project, plan);
  const titleOf = (id: string) =>
    project.slides.find((s) => s.id === id)?.title ?? "";
  return (
    <>
      {designed.length > 0 && (
        <>
          <h3>Trình bày lại {designed.length} trang</h3>
          <ol className="ai-pages">
            {designed.map((p) => (
              <li key={p.id} className={pages.has(p.id) ? "" : "excluded"}>
                <label className="ai-page-head">
                  <input
                    type="checkbox"
                    checked={pages.has(p.id)}
                    aria-label={`Trình bày lại trang ${titleOf(p.id)}`}
                    onChange={(e) =>
                      setPages(toggle(pages, p.id, e.target.checked))
                    }
                  />
                  <span>
                    <strong>{p.title || titleOf(p.id)}</strong>{" "}
                    <span className="ai-kind">{designLabels[p.design]}</span>
                  </span>
                </label>
                <ul className="ai-bullets">
                  {p.items.map((i, k) => (
                    <li key={k}>
                      {p.design === "COMPARE"
                        ? `${p.groups[i.group] ?? ""}: `
                        : ""}
                      <strong>{i.title}</strong>
                      {i.text ? ` — ${i.text}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
      {usable.length > 0 && (
        <>
          <h3>Thêm {usable.length} hoạt động</h3>
          <ol className="ai-pages">
            {usable.map((a, i) => (
              <li key={i} className={activities.has(i) ? "" : "excluded"}>
                <label className="ai-page-head">
                  <input
                    type="checkbox"
                    checked={activities.has(i)}
                    aria-label={`Thêm hoạt động ${a.title}`}
                    onChange={(e) =>
                      setActivities(toggle(activities, i, e.target.checked))
                    }
                  />
                  <span>
                    <strong>{a.title}</strong>{" "}
                    <span className="ai-kind">{activityLabels[a.type]}</span>
                    <small className="ai-after">
                      {" "}
                      · sau trang “{titleOf(a.afterId)}”
                    </small>
                  </span>
                </label>
                {a.instruction && <p className="ai-note">{a.instruction}</p>}
                <ul className="ai-bullets">
                  {a.type === "SCENARIO" && a.scenario ? (
                    <>
                      <li>{a.scenario.situation}</li>
                      {a.scenario.choices.map((c, k) => (
                        <li key={k}>
                          {c.isRecommended ? "✓ " : ""}
                          {c.text}
                        </li>
                      ))}
                    </>
                  ) : a.type === "TRUE_FALSE" || a.type === "QUIZ" ? (
                    a.questions.map((q, k) => (
                      <li key={k}>
                        {q.prompt}{" "}
                        <em>
                          (đáp án:{" "}
                          {a.type === "TRUE_FALSE"
                            ? (["Đúng", "Sai"][q.correct] ?? "Đúng")
                            : q.options[q.correct]}
                          )
                        </em>
                      </li>
                    ))
                  ) : (
                    a.items.map((it, k) => (
                      <li key={k}>
                        {a.type === "ORDER" ? `${k + 1}. ` : ""}
                        {it.text}
                        {a.type === "MATCH" ? ` ↔ ${it.match}` : ""}
                        {a.type === "SORT"
                          ? ` → ${a.groups[it.group] ?? ""}`
                          : ""}
                      </li>
                    ))
                  )}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
      {renamed.length > 0 && (
        <label className="ai-page-head ai-titles">
          <input
            type="checkbox"
            checked={titles}
            onChange={(e) => setTitles(e.target.checked)}
          />
          <span>
            Sửa tiêu đề {renamed.length} trang khác (ví dụ “
            {titleOf(renamed[0].id)}” → “{renamed[0].title}”)
          </span>
        </label>
      )}
      {suggested.length > 0 && (
        <>
          <h3>Gợi ý đáp án cho {suggested.length} câu chưa có đáp án</h3>
          <p className="hint">
            PowerPoint không cho biết đáp án của các câu này. Thầy cô kiểm tra
            rồi tích để dùng đáp án AI gợi ý.
          </p>
          <ul className="ai-answers">
            {suggested.map(({ question: q, correct }) => (
              <li key={q.id}>
                <label className="ai-page-head">
                  <input
                    type="checkbox"
                    checked={answers.has(q.id)}
                    aria-label={`Dùng đáp án gợi ý cho câu “${q.prompt}”`}
                    onChange={(e) =>
                      setAnswers(toggle(answers, q.id, e.target.checked))
                    }
                  />
                  <span>
                    <strong>{q.prompt}</strong> → đáp án:{" "}
                    {correct.map((i) => q.options[i].text).join("; ")}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {!designed.length &&
        !usable.length &&
        !renamed.length &&
        !suggested.length && (
        <p>AI chưa đề xuất được thay đổi nào cho bài này.</p>
      )}
      {plan.explanations.length > 0 && (
        <p className="hint">
          Kèm {plan.explanations.length} lời giải thích cho câu hỏi đã có.
        </p>
      )}
      <div className="modal-actions">
        <button onClick={cancel}>Quay lại</button>
        <button
          className="primary"
          disabled={
            !pages.size &&
            !activities.size &&
            !plan.explanations.length &&
            !answers.size
          }
          onClick={confirm}
        >
          Áp dụng ({pages.size} trang, {activities.size} hoạt động)
        </button>
      </div>
    </>
  );
}
