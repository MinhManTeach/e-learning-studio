import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import type { AssetReference, LessonProject } from "../model/schema";
import type { StoredMedia } from "../media/model";
import { attachMedia } from "../media/service";
import {
  applyPolish,
  illustrationPrompt,
  illustrationsWanted,
  pictureAssets,
  polishPlanSchema,
  polishRequest,
  type PolishImage,
  type PolishPlan,
} from "./polish";
import "./ai-studio.css";

export interface StudioMedia {
  get(assetId: string, projectId: string): Promise<StoredMedia | undefined>;
  put(value: StoredMedia): Promise<void>;
}
interface Status {
  configured: boolean;
  model: string;
  imageModel: string;
}
/** Pictures bigger than this are not sent to the AI (it still sees the page text). */
const maxPictureBytes = 1_500_000;
/** Approximate price of one 1K picture, for the teacher's information. */
const pricePerPicture = "≈ 0,034 USD";

const messages: Record<string, string> = {
  AI_CONFIGURATION:
    "Khoá API chưa đúng hoặc chưa được cấp quyền. Kiểm tra LESSON_AI_API_KEY trong tệp .env.local rồi khởi động lại npm run dev.",
  AI_MODEL:
    "Không tìm thấy mô hình AI. Kiểm tra LESSON_AI_MODEL và LESSON_AI_IMAGE_MODEL trong tệp .env.local.",
  AI_RATE_LIMIT:
    "Khoá API đã hết lượt dùng tạm thời (giới hạn tốc độ hoặc hạn mức). Đợi một lúc rồi thử lại.",
  AI_TIMEOUT: "AI trả lời quá lâu. Hãy thử lại.",
  AI_BUSY:
    "Gemini đang quá tải (nhiều người dùng cùng lúc). Hãy thử lại sau ít phút.",
  AI_NETWORK: "Không kết nối được tới Gemini. Kiểm tra mạng rồi thử lại.",
  AI_REQUEST:
    "Gemini không nhận yêu cầu này. Nếu lỗi lặp lại, hãy thử đổi LESSON_AI_MODEL.",
  AI_TOO_LONG: "Bài quá dài cho một lần làm. Hãy bỏ bớt trang rồi thử lại.",
  AI_REFUSED: "AI từ chối hoặc dừng giữa chừng. Hãy thử lại.",
  AI_INVALID_RESPONSE: "AI trả lời chưa đúng dạng. Hãy thử lại.",
  AI_NO_IMAGE: "AI không vẽ được tranh cho trang này.",
};
const pictureBilling =
  "Chưa vẽ được tranh: vẽ tranh không có gói miễn phí. Hãy bật thanh toán (Billing) cho dự án của khoá trong Google AI Studio, hoặc đợi khi hạn mức được làm mới. Phần chữ vẫn đã được áp dụng.";
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
function fromBase64(data: string) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function pagePictures(project: LessonProject, media: StudioMedia) {
  const images = new Map<string, PolishImage>();
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
  | { step: "review"; plan: PolishPlan }
  | { step: "done"; pages: number; pictures: number; failed: string[] };

/** "AI làm đẹp bài giảng": the AI proposes, the teacher picks, nothing changes until "Áp dụng". */
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
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [draw, setDraw] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    fetcher("/api/lesson-ai/studio/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: Status) => live && setStatus(s))
      .catch(
        () =>
          live && setStatus({ configured: false, model: "", imageModel: "" }),
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
      const request = polishRequest(
        project,
        await pagePictures(project, media),
      );
      setPhase({
        step: "working",
        label: `AI đang đọc ${request.slides.length} trang (thường mất 30–90 giây)…`,
      });
      const plan = polishPlanSchema.parse(
        await post(fetcher, "polish", request),
      );
      setAccepted(new Set(plan.slides.map((s) => s.id)));
      setDraw(
        new Set(illustrationsWanted(project, plan).map((w) => w.slideId)),
      );
      setPhase({ step: "review", plan });
    } catch (e) {
      setError(
        explain(e instanceof AiError ? e.message : "AI_INVALID_RESPONSE"),
      );
      setPhase({ step: "intro" });
    }
  }

  async function confirm(plan: PolishPlan) {
    setError("");
    const wanted = illustrationsWanted(project, plan).filter(
      (w) => draw.has(w.slideId) && accepted.has(w.slideId),
    );
    let next = applyPolish(project, plan, accepted);
    const failed: string[] = [];
    let drawn = 0;
    for (const [i, w] of wanted.entries()) {
      setPhase({
        step: "working",
        label: `Đang vẽ tranh ${i + 1}/${wanted.length}: ${w.title}…`,
      });
      try {
        const image = (await post(fetcher, "illustrate", {
          prompt: illustrationPrompt(plan.illustrationStyle, w.prompt),
        })) as { mimeType: string; data: string };
        const bytes = fromBase64(image.data);
        const blob = new Blob([bytes], { type: image.mimeType });
        const id = `ai-${crypto.randomUUID()}`;
        await media.put({
          assetId: id,
          projectId: project.projectId,
          blob,
          mimeType: image.mimeType,
          size: blob.size,
          source: {
            title: `Tranh AI vẽ: ${w.title}`,
            provider: "UPLOAD",
            sourceUrl: "",
            creator: "Gemini (AI)",
            license: "",
            licenseUrl: "",
            attribution: "Tranh do AI tạo",
          },
        });
        const asset: AssetReference = {
          id,
          kind: "IMAGE",
          sourceType: "GENERATED",
          name: `Tranh AI: ${w.title}`,
          fileName: `${id}.${image.mimeType.split("/")[1]}`,
          mimeType: image.mimeType,
          size: blob.size,
          url: `local-media:${id}`,
          altText: w.title,
          status: "LOCAL",
        };
        next = attachMedia(next, w.slideId, asset, "");
        drawn++;
      } catch (e) {
        const code = e instanceof AiError ? e.message : "AI_NO_IMAGE";
        if (code === "AI_RATE_LIMIT" || code === "AI_CONFIGURATION") {
          // The key cannot draw at all; do not try every page.
          failed.push(pictureBilling);
          break;
        }
        failed.push(`${w.title}: ${explain(code)}`);
      }
    }
    apply(next);
    setPhase({ step: "done", pages: accepted.size, pictures: drawn, failed });
  }

  const busy = phase.step === "working";
  return (
    <div className="modal-overlay">
      <div
        className="modal ai-studio"
        role="dialog"
        aria-modal="true"
        aria-label="AI làm đẹp bài giảng"
      >
        <div className="ai-head">
          <h2>
            <Sparkles size={22} /> AI làm đẹp bài giảng
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
                Lấy khoá API tại Google AI Studio (aistudio.google.com → Get API
                key).
              </li>
              <li>
                Trong thư mục dự án, tạo tệp <code>.env.local</code> với nội
                dung:
                <pre>{`LESSON_AI_PROVIDER=gemini\nLESSON_AI_API_KEY=khoá-của-thầy-cô`}</pre>
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
              AI đọc chữ và tranh của từng trang rồi đề xuất: tiêu đề rõ ràng,
              nội dung ngắn gọn hợp lứa tuổi, lời đọc tự nhiên, mô tả tranh, lời
              giải thích cho câu hỏi và tranh minh hoạ mới cho trang chưa có
              hình. Kiến thức, đáp án và thứ tự trang được giữ nguyên. Thầy cô
              xem và chọn trước khi áp dụng.
            </p>
            <p className="hint">
              Dùng khoá Gemini của thầy cô ({status.model}). Mỗi tranh vẽ thêm{" "}
              {pricePerPicture}.
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
            accepted={accepted}
            setAccepted={setAccepted}
            draw={draw}
            setDraw={setDraw}
            cancel={() => setPhase({ step: "intro" })}
            confirm={() => void confirm(phase.plan)}
          />
        ) : (
          <>
            <p role="status">
              Đã làm đẹp {phase.pages} trang
              {phase.pictures ? ` và vẽ ${phase.pictures} tranh` : ""}. Nếu chưa
              ưng, bấm “Hoàn tác cải thiện” trên thanh công cụ.
            </p>
            {phase.failed.length > 0 && (
              <ul className="ai-failed">
                {phase.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
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

function Review({
  project,
  plan,
  accepted,
  setAccepted,
  draw,
  setDraw,
  cancel,
  confirm,
}: {
  project: LessonProject;
  plan: PolishPlan;
  accepted: Set<string>;
  setAccepted: (s: Set<string>) => void;
  draw: Set<string>;
  setDraw: (s: Set<string>) => void;
  cancel: () => void;
  confirm: () => void;
}) {
  const wanted = new Map(
    illustrationsWanted(project, plan).map((w) => [w.slideId, w]),
  );
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const pictures = [...draw].filter(
    (id) => accepted.has(id) && wanted.has(id),
  ).length;
  return (
    <>
      <p>
        AI đề xuất thay đổi cho {plan.slides.length} trang. Bỏ chọn trang không
        muốn đổi.
      </p>
      <ol className="ai-pages">
        {plan.slides.map((p) => {
          const slide = project.slides.find((s) => s.id === p.id);
          if (!slide) return null;
          const on = accepted.has(p.id);
          const w = wanted.get(p.id);
          const cover = slide.layout === "MEDIA_COVER";
          return (
            <li key={p.id} className={on ? "" : "excluded"}>
              <label className="ai-page-head">
                <input
                  type="checkbox"
                  checked={on}
                  aria-label={`Áp dụng cho trang ${slide.title}`}
                  onChange={(e) =>
                    setAccepted(toggle(accepted, p.id, e.target.checked))
                  }
                />
                <span>
                  {p.title && p.title !== slide.title ? (
                    <>
                      <s>{slide.title}</s> → <strong>{p.title}</strong>
                    </>
                  ) : (
                    <strong>{slide.title}</strong>
                  )}
                </span>
              </label>
              {slide.type === "content" &&
                !cover &&
                p.bulletPoints.length > 0 && (
                  <ul className="ai-bullets">
                    {p.bulletPoints.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              {p.keyTakeaway && !cover && (
                <p className="ai-note">Em cần nhớ: {p.keyTakeaway}</p>
              )}
              {p.explanations.length > 0 && (
                <p className="ai-note">
                  Thêm {p.explanations.length} lời giải thích cho câu hỏi.
                </p>
              )}
              {p.teacherOnly.length > 0 && (
                <p className="ai-note">
                  Chuyển {p.teacherOnly.length} câu hướng dẫn sang ghi chú giáo
                  viên.
                </p>
              )}
              {w && (
                <label className="ai-draw">
                  <input
                    type="checkbox"
                    checked={draw.has(p.id)}
                    disabled={!on}
                    onChange={(e) =>
                      setDraw(toggle(draw, p.id, e.target.checked))
                    }
                  />
                  <span>
                    Vẽ tranh minh hoạ: <em>{w.prompt}</em>
                  </span>
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <div className="modal-actions">
        <button onClick={cancel}>Quay lại</button>
        <button className="primary" disabled={!accepted.size} onClick={confirm}>
          Áp dụng {accepted.size} trang
          {pictures
            ? ` và vẽ ${pictures} tranh (${pricePerPicture}/tranh)`
            : ""}
        </button>
      </div>
    </>
  );
}
