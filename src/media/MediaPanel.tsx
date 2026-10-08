import { useEffect, useRef, useState } from "react";
import type { AssetReference, LessonProject } from "../model/schema";
import { MediaIntentAnalyzer } from "./intent";
import { WikimediaCommonsProvider } from "./provider";
import { MediaReadinessValidator, MediaSelectionService } from "./service";
import {
  isReusableLicense,
  type MediaCandidate,
  type MediaSearchProvider,
  type MediaStatus,
} from "./model";
import "./media.css";
import { rankSourceImages } from "./docx";
import { SourceImageCandidate } from "./SourceImageCandidate";
const provider = new WikimediaCommonsProvider();
const selection = new MediaSelectionService();
const labels: Record<MediaStatus, string> = {
  NEEDS_MEDIA: "Cần hình ảnh",
  SEARCHING: "Đang tìm",
  CANDIDATES_READY: "Có ảnh đề xuất",
  SELECTED: "Đã chọn · đang tải",
  STORED: "Đã lưu ảnh trên thiết bị",
  MISSING: "Thiếu binary ảnh",
  EXTERNAL_DEPENDENCY: "Ảnh phụ thuộc Internet",
  ERROR: "Lỗi hình ảnh",
  SKIPPED: "Đã bỏ qua",
};
export function MediaPanel({
  project,
  initialSlideId,
  close,
  attach,
  searchProvider = provider,
  selectionService = selection,
}: {
  project: LessonProject;
  initialSlideId: string | null;
  close: () => void;
  attach: (slideId: string, asset: AssetReference, caption: string) => void;
  searchProvider?: MediaSearchProvider;
  selectionService?: MediaSelectionService;
}) {
  const [slideId, setSlideId] = useState(
    initialSlideId ?? project.slides[0]?.id ?? "",
  );
  const slide = project.slides.find((s) => s.id === slideId);
  const sourceCandidates = slide ? rankSourceImages(project, slide) : [];
  const [sourceUnsuitable, setSourceUnsuitable] = useState(false);
  const [query, setQuery] = useState("");
  const [alt, setAlt] = useState("");
  const [candidates, setCandidates] = useState<MediaCandidate[]>([]);
  const [statuses, setStatuses] = useState<Record<string, MediaStatus>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<MediaCandidate | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState<"search" | "store" | null>(null);
  const abort = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (preview) previewRef.current?.scrollIntoView({ block: "nearest" });
  }, [preview]);
  const intent = slide
    ? new MediaIntentAnalyzer().analyze(project, slide)
    : null;
  useEffect(() => {
    abort.current?.abort();
    setOperation(null);
    setCandidates([]);
    setError("");
    setNotice("");
    setPreview(null);
    setConfirmed(false);
    setSourceUnsuitable(false);
    setQuery(
      slide
        ? (new MediaIntentAnalyzer().analyze(project, slide).queries.at(-1) ??
            "")
        : "",
    );
    setAlt(slide?.title ?? "");
    return () => abort.current?.abort();
  }, [slideId]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      project.slides.map(async (s) => {
        try {
          return [
            s.id,
            await new MediaReadinessValidator(selectionService.store).status(
              project,
              s,
            ),
          ] as const;
        } catch {
          return [s.id, "ERROR"] as const;
        }
      }),
    ).then((results) => {
      if (!cancelled)
        setStatuses((current) => ({
          ...current,
          ...Object.fromEntries(
            results.filter(
              ([id]) =>
                ![
                  "SEARCHING",
                  "SELECTED",
                  "CANDIDATES_READY",
                  "SKIPPED",
                ].includes(current[id]),
            ),
          ),
        }));
    });
    return () => {
      cancelled = true;
    };
  }, [project, selectionService]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus();
  }, []);
  function status(value: MediaStatus) {
    setStatuses((old) => ({ ...old, [slideId]: value }));
  }
  async function search() {
    if (sourceCandidates.length && !sourceUnsuitable) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setNotice("");
    setCandidates([]);
    setPreview(null);
    setOperation("search");
    status("SEARCHING");
    try {
      const results = await searchProvider.search(query, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates(results);
      status("CANDIDATES_READY");
      if (!results.length)
        setNotice(
          "Chưa tìm thấy ảnh phù hợp. Đổi từ khóa hoặc tải ảnh của thầy/cô.",
        );
    } catch {
      if (!controller.signal.aborted) {
        setError(
          "Không kết nối được nguồn ảnh. Thử lại hoặc tải ảnh từ máy; ứng dụng chưa gắn ảnh nào.",
        );
        status("ERROR");
      }
    } finally {
      if (!controller.signal.aborted) setOperation(null);
    }
  }
  async function storeImage(candidate: MediaCandidate | File) {
    if (!confirmed || !slide) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");
    setNotice("");
    setOperation("store");
    status("SELECTED");
    const targetId = slideId;
    try {
      const result =
        candidate instanceof File
          ? await selectionService.upload(
              candidate,
              project.projectId,
              alt,
              controller.signal,
            )
          : await selectionService.select(
              candidate,
              project.projectId,
              alt,
              controller.signal,
            );
      if (controller.signal.aborted) return;
      attach(targetId, result.asset, result.caption);
      status("STORED");
      setNotice(
        "Đã lưu binary ảnh và gắn vào trang. Theo dõi trạng thái Lưu bài trước khi đóng.",
      );
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(
          e instanceof Error
            ? e.message
            : "Không lưu được ảnh. Thử tải ảnh từ máy.",
        );
        status("ERROR");
      }
    } finally {
      if (!controller.signal.aborted) setOperation(null);
    }
  }
  async function chooseSource(asset: AssetReference, caption: string) {
    if (!confirmed || !slide || operation) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setOperation("store");
    setError("");
    const targetId = slideId;
    try {
      if (!(await selectionService.store.get(asset.id, project.projectId)))
        throw new Error(
          "Thiếu ảnh nguồn trên thiết bị. Hãy nhập lại KHBD hoặc tải ảnh từ máy.",
        );
      if (controller.signal.aborted) return;
      attach(
        targetId,
        { ...asset, altText: alt.trim() || asset.altText },
        caption,
      );
      status("STORED");
      setNotice(
        "Đã gắn ảnh KHBD đã duyệt. Theo dõi trạng thái Lưu bài trước khi đóng.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Không đọc được ảnh nguồn.");
    } finally {
      if (!controller.signal.aborted) setOperation(null);
    }
  }
  const counts = (value: MediaStatus) =>
    Object.values(statuses).filter((s) => s === value).length;
  return (
    <div className="modal-overlay media-overlay">
      <section
        ref={dialog}
        className="media-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            abort.current?.abort();
            close();
          }
          if (event.key === "Tab") {
            const items = Array.from(
              dialog.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
              ) ?? [],
            );
            const first = items[0],
              last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <p className="eyebrow">HỌC LIỆU TRÊN THIẾT BỊ</p>
            <h2 id="media-title">Bổ sung hình ảnh cho bài giảng</h2>
          </div>
          <button
            onClick={() => {
              abort.current?.abort();
              close();
            }}
          >
            Đóng
          </button>
        </header>
        <p className="media-counts">
          Tổng {project.slides.length} trang · Cần ảnh {counts("NEEDS_MEDIA")} ·
          Có ảnh {counts("STORED")} · Bỏ qua {counts("SKIPPED")} · Lỗi/thiếu{" "}
          {counts("ERROR") + counts("MISSING")} · Ảnh mạng{" "}
          {counts("EXTERNAL_DEPENDENCY")}
        </p>
        <label>
          Trang cần minh họa
          <select
            aria-label="Trang cần minh họa"
            value={slideId}
            disabled={operation === "store"}
            onChange={(e) => setSlideId(e.target.value)}
          >
            {project.slides.map((s, i) => (
              <option key={s.id} value={s.id}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
        </label>
        <p role="status">{labels[statuses[slideId] ?? "NEEDS_MEDIA"]}</p>
        {slide && (
          <>
            <h3>Hình ảnh đề xuất</h3>
            <p>
              Chọn ảnh phù hợp nội dung và lứa tuổi. Kết quả tìm kiếm chưa được
              xác nhận an toàn; ảnh hiện có chỉ thay khi thầy/cô chọn ảnh mới.
            </p>
            {sourceCandidates.length > 0 && (
              <section aria-label="Ảnh từ KHBD">
                <h3>Ảnh từ KHBD — duyệt trước khi tìm ảnh mạng</h3>
                <p>
                  Ảnh do giáo viên cung cấp. Ứng dụng chưa xác minh quyền tái sử
                  dụng.
                </p>
                <div className="media-candidates">
                  {sourceCandidates.map((candidate) => (
                    <SourceImageCandidate
                      key={candidate.asset.id + candidate.placement.id}
                      asset={candidate.asset}
                      placement={candidate.placement}
                      projectId={project.projectId}
                      preferred={candidate.reason === "EXACT_SOURCE"}
                      disabled={!confirmed || !!operation}
                      choose={() =>
                        void chooseSource(
                          candidate.asset,
                          [
                            candidate.placement.caption,
                            candidate.asset.docxSource?.attribution,
                          ]
                            .filter(Boolean)
                            .join(" · "),
                        )
                      }
                    />
                  ))}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={sourceUnsuitable}
                    onChange={(e) => setSourceUnsuitable(e.target.checked)}
                  />
                  Ảnh nguồn chưa phù hợp; tìm ảnh thay thế trên Wikimedia
                </label>
              </section>
            )}
            <div className="media-query-options">
              {intent?.queries.map((q) => (
                <button
                  key={q}
                  disabled={!!operation}
                  onClick={() => setQuery(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void search();
              }}
            >
              <label>
                Từ khóa tìm ảnh
                <input
                  aria-label="Từ khóa tìm ảnh"
                  value={query}
                  maxLength={300}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={
                  !!operation ||
                  !query.trim() ||
                  (sourceCandidates.length > 0 && !sourceUnsuitable)
                }
              >
                Tìm ảnh Wikimedia Commons
              </button>
              {operation && (
                <button
                  type="button"
                  onClick={() => {
                    abort.current?.abort();
                    setOperation(null);
                    status("NEEDS_MEDIA");
                  }}
                >
                  Hủy thao tác
                </button>
              )}
            </form>
            <label>
              Mô tả ảnh (alt text)
              <input
                aria-label="Mô tả ảnh (alt text)"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </label>
            <label className="media-consent">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Tôi đã kiểm tra ảnh phù hợp lứa tuổi và quyền sử dụng; giữ thông
              tin ghi công.
            </label>
            <div className="media-actions">
              <label className="upload-own">
                Tải ảnh của thầy/cô (PNG/JPEG/WebP, tối đa 8 MB)
                <input
                  aria-label="Tải ảnh của thầy/cô"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={!confirmed || !!operation}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void storeImage(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                disabled={!!operation}
                onClick={() => {
                  status("SKIPPED");
                  setCandidates([]);
                  setNotice(
                    "Đã bỏ qua đề xuất cho trang này trong phiên hiện tại. Ảnh đã gắn vẫn được giữ.",
                  );
                }}
              >
                Bỏ qua ảnh
              </button>
              <button
                disabled={!!operation}
                onClick={() => {
                  const next =
                    project.slides[
                      project.slides.findIndex((s) => s.id === slideId) + 1
                    ];
                  if (next) setSlideId(next.id);
                }}
              >
                Trang tiếp theo
              </button>
            </div>
            {error && (
              <p className="error-banner" role="alert">
                {error}
              </p>
            )}
            {notice && <p role="status">{notice}</p>}
            <div className="media-candidates">
              {candidates.map((candidate) => (
                <article key={candidate.id}>
                  <img
                    loading="lazy"
                    src={candidate.thumbnailUrl}
                    alt={candidate.title}
                    referrerPolicy="no-referrer"
                  />
                  <h4>{candidate.title}</h4>
                  <p>
                    Wikimedia Commons · {candidate.creator || "Chưa rõ tác giả"}
                  </p>
                  <p>{candidate.license}</p>
                  <p className="attribution">{candidate.attribution}</p>
                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Nguồn ảnh
                  </a>
                  {candidate.licenseUrl && (
                    <a
                      href={candidate.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Giấy phép
                    </a>
                  )}
                  <div>
                    <button onClick={() => setPreview(candidate)}>
                      Xem ảnh
                    </button>
                    <button
                      disabled={
                        !confirmed ||
                        !!operation ||
                        !isReusableLicense(candidate.license)
                      }
                      onClick={() => void storeImage(candidate)}
                    >
                      Chọn ảnh
                    </button>
                    <button
                      onClick={() => {
                        setCandidates((list) =>
                          list.filter((c) => c.id !== candidate.id),
                        );
                        if (preview?.id === candidate.id) setPreview(null);
                      }}
                    >
                      Loại ảnh
                    </button>
                  </div>
                  {!isReusableLicense(candidate.license) && (
                    <p>
                      Không thể chọn: giấy phép chưa rõ hoặc không tương thích.
                    </p>
                  )}
                </article>
              ))}
            </div>
            {preview && (
              <figure ref={previewRef} className="media-large-preview">
                <button onClick={() => setPreview(null)}>Đóng xem ảnh</button>
                <img
                  src={preview.thumbnailUrl}
                  alt={preview.title}
                  referrerPolicy="no-referrer"
                />
                <figcaption>{preview.attribution}</figcaption>
              </figure>
            )}
          </>
        )}
      </section>
    </div>
  );
}
