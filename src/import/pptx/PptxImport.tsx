import { useState } from "react";
import { FileUp, Images, Presentation, X } from "lucide-react";
import type { LessonProject } from "../../model/schema";
import type { StoredMedia } from "../../media/model";
import type { ProjectStore } from "../../storage/projects";
import { analyzeDeck, type DeckAnalysis, type DraftPage } from "./analyze";
import { parsePptx, PptxError } from "./parse";
import {
  buildLessonFromPptx,
  slideNumberFromName,
  type SlidePicture,
} from "./build";
import "./pptx-import.css";

export interface MediaWriter {
  put(value: StoredMedia): Promise<void>;
}
const kindLabel = { PAGE: "Trang", VIDEO: "Video", QUESTIONS: "Câu hỏi" };
const letter = (i: number) => String.fromCharCode(65 + i);
const titleFromFile = (name: string) =>
  name
    .replace(/\.pptx$/i, "")
    .replace(/[_]+/g, " ")
    .trim();

interface Review {
  pptx: Uint8Array;
  analysis: DeckAnalysis;
  pages: DraftPage[];
  include: boolean[];
  pictures: SlidePicture[];
}

/** Turns one PowerPoint (one lesson period) into a new lesson after the teacher reviews it. */
export function PptxImport({
  store,
  media,
  open,
  onClose,
}: {
  store: ProjectStore;
  media: MediaWriter;
  open: (project: LessonProject) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [pictureFiles, setPictureFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{
    project: LessonProject;
    warnings: string[];
  } | null>(null);

  async function analyse() {
    if (!file) return;
    setBusy("Đang đọc PowerPoint…");
    setError("");
    try {
      const pptx = new Uint8Array(await file.arrayBuffer());
      const analysis = analyzeDeck(parsePptx(pptx));
      const pictures: SlidePicture[] = [];
      for (const f of pictureFiles) {
        const slide = slideNumberFromName(f.name);
        if (slide)
          pictures.push({
            slide,
            name: f.name,
            bytes: new Uint8Array(await f.arrayBuffer()),
          });
      }
      setReview({
        pptx,
        analysis,
        pages: analysis.pages,
        include: analysis.pages.map(() => true),
        pictures,
      });
    } catch (e) {
      setError(
        e instanceof PptxError
          ? e.message
          : "Chưa đọc được tệp PowerPoint. Hãy lưu lại tệp ở dạng .pptx rồi thử lại.",
      );
    } finally {
      setBusy("");
    }
  }
  function update(i: number, page: DraftPage) {
    setReview((r) =>
      r ? { ...r, pages: r.pages.map((p, k) => (k === i ? page : p)) } : r,
    );
  }
  async function create() {
    if (!review) return;
    setBusy("Đang tạo bài giảng…");
    setError("");
    try {
      const result = buildLessonFromPptx({
        title,
        subject,
        grade,
        pages: review.pages.filter((_, i) => review.include[i]),
        pptx: review.pptx,
        slidePictures: review.pictures,
      });
      for (const m of result.media) await media.put(m);
      await store.save(result.project);
      if (result.warnings.length) setDone(result);
      else open(result.project);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Chưa tạo được bài giảng: ${e.message}`
          : "Chưa tạo được bài giảng. Hãy thử lại.",
      );
    } finally {
      setBusy("");
    }
  }

  const kept = review ? review.include.filter(Boolean).length : 0;
  return (
    <div className="modal-overlay">
      <div
        className="modal pptx-import"
        role="dialog"
        aria-modal="true"
        aria-label="Nhập bài giảng từ PowerPoint"
      >
        <div className="pptx-head">
          <h2>
            <Presentation size={22} /> Nhập từ PowerPoint
          </h2>
          <button aria-label="Đóng" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {done ? (
          <>
            <p>
              Đã tạo bài “{done.project.metadata.projectTitle}” với{" "}
              {done.project.slides.length} trang. Một số mục cần thầy cô xem
              lại:
            </p>
            <ul className="pptx-warnings">
              {done.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <button className="primary" onClick={() => open(done.project)}>
                Mở bài giảng
              </button>
            </div>
          </>
        ) : !review ? (
          <>
            <p>
              Chọn tệp PowerPoint của một tiết học. Ứng dụng đọc chữ, tranh,
              video và câu hỏi trong tệp; thầy cô xem lại trước khi tạo bài.
            </p>
            <label className="pptx-file">
              <FileUp size={18} />
              <span>{file ? file.name : "Chọn tệp .pptx"}</span>
              <input
                type="file"
                accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                aria-label="Tệp PowerPoint"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title) setTitle(titleFromFile(f.name));
                }}
              />
            </label>
            <label className="pptx-file">
              <Images size={18} />
              <span>
                {pictureFiles.length
                  ? `${pictureFiles.length} ảnh slide`
                  : "Ảnh các slide (không bắt buộc)"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                aria-label="Ảnh các slide"
                onChange={(e) => setPictureFiles([...(e.target.files ?? [])])}
              />
            </label>
            <p className="hint">
              Muốn giữ nguyên thiết kế slide: trong PowerPoint chọn Tệp → Xuất →
              PNG → Tất cả các trang chiếu, rồi chọn toàn bộ ảnh đó ở đây.
            </p>
            <div className="pptx-meta">
              <label>
                <span>Tên bài giảng</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                <span>Môn học</span>
                <input
                  value={subject}
                  placeholder="Tin học"
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label>
                <span>Lớp</span>
                <input
                  value={grade}
                  placeholder="3"
                  onChange={(e) => setGrade(e.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={onClose}>Hủy</button>
              <button
                className="primary"
                disabled={!file || !!busy}
                onClick={() => void analyse()}
              >
                {busy || "Đọc PowerPoint"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              Tìm thấy {review.pages.length} trang dùng được
              {review.pictures.length
                ? `, ${review.pictures.length} ảnh slide`
                : ""}
              . Bỏ chọn trang không cần, sửa tiêu đề và kiểm tra đáp án đúng.
            </p>
            <ol className="pptx-pages">
              {review.pages.map((page, i) => (
                <li
                  key={`${page.slide}-${i}`}
                  className={review.include[i] ? "" : "excluded"}
                >
                  <div className="pptx-page-head">
                    <input
                      type="checkbox"
                      checked={review.include[i]}
                      aria-label={`Giữ slide ${page.slide}`}
                      onChange={(e) =>
                        setReview({
                          ...review,
                          include: review.include.map((v, k) =>
                            k === i ? e.target.checked : v,
                          ),
                        })
                      }
                    />
                    <span className="pptx-slide-no">Slide {page.slide}</span>
                    <span className={`pptx-kind kind-${page.kind}`}>
                      {kindLabel[page.kind]}
                    </span>
                    <input
                      className="pptx-title"
                      value={page.title}
                      aria-label={`Tiêu đề slide ${page.slide}`}
                      onChange={(e) =>
                        update(i, { ...page, title: e.target.value })
                      }
                    />
                    {review.pictures.some((p) => p.slide === page.slide) && (
                      <span className="pptx-badge">Ảnh slide</span>
                    )}
                  </div>
                  {page.kind === "QUESTIONS" &&
                    page.questions.map((q, qi) => (
                      <fieldset key={qi} className="pptx-question">
                        <legend>
                          {q.prompt || "Câu hỏi"}
                          {q.correct.length !== 1 && (
                            <strong className="pptx-check">
                              {" "}
                              · Hãy chọn đáp án đúng
                            </strong>
                          )}
                        </legend>
                        {q.options.map((o, oi) => (
                          <label key={oi}>
                            <input
                              type="radio"
                              name={`q-${i}-${qi}`}
                              checked={
                                q.correct.length === 1 && q.correct[0] === oi
                              }
                              onChange={() =>
                                update(i, {
                                  ...page,
                                  questions: page.questions.map((x, k) =>
                                    k === qi ? { ...x, correct: [oi] } : x,
                                  ),
                                })
                              }
                            />
                            <span>
                              {letter(oi)}. {o.text || "(tranh)"}
                              {o.image ? " 🖼" : ""}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    ))}
                </li>
              ))}
            </ol>
            {review.analysis.skipped.length > 0 && (
              <details className="pptx-skipped">
                <summary>
                  {review.analysis.skipped.length} slide được bỏ qua
                </summary>
                <ul>
                  {review.analysis.skipped.map((s) => (
                    <li key={s.slide}>
                      Slide {s.slide}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="modal-actions">
              <button onClick={() => setReview(null)}>Quay lại</button>
              <button
                className="primary"
                disabled={!kept || !!busy}
                onClick={() => void create()}
              >
                {busy || `Tạo bài giảng (${kept} trang)`}
              </button>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
