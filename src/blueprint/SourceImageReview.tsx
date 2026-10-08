import { useEffect, useState } from "react";
import type {
  ImportedLessonDocument,
  PedagogicalAnalysis,
} from "../import/model";
import { associateDocxImages } from "../media/docx";
import { editSlide, type BlueprintDraft } from "./draft";

export function SourceImageReview({
  document,
  analysis,
  draft,
  change,
}: {
  document: ImportedLessonDocument;
  analysis: PedagogicalAnalysis;
  draft: BlueprintDraft;
  change: (d: BlueprintDraft) => void;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const next = Object.fromEntries(
      (document.mediaAssets ?? []).map((m) => [
        m.id,
        URL.createObjectURL(
          new Blob([new Uint8Array(m.bytes)], { type: m.contentType }),
        ),
      ]),
    );
    setUrls(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [document]);
  const b = draft.current;
  const candidates = associateDocxImages(document, analysis).filter(
    (p) =>
      p.status === "VALID" &&
      (!b.periodReview ||
        b.activityPlan?.some((t) => t.activity.id === p.activityId)),
  );
  if (!candidates.length) return null;
  return (
    <details className="period-selection">
      <summary>Đối chiếu và chọn ảnh DOCX trước khi tạo bài</summary>
      <p>
        Giữ nguyên nguồn ảnh. Chọn ảnh theo nhiệm vụ học tập; không thay bằng
        kết quả tìm kiếm tự động.
      </p>
      {b.proposedSlides
        .filter((s) => s.mediaIntent?.type === "IMAGE")
        .map((s) => {
          const p = candidates.find((p) => p.id === s.sourceImagePlacementId);
          return (
            <div className="source-image-review" key={s.id}>
              <h3>
                Trang {s.order}: {s.title}
              </h3>
              {p?.mediaId && urls[p.mediaId] && (
                <img
                  src={urls[p.mediaId]}
                  alt={
                    p.altText || p.caption || "Ảnh DOCX để giáo viên đối chiếu"
                  }
                />
              )}
              <label>
                Ảnh nguồn cho trang {s.order}
                <select
                  value={s.sourceImagePlacementId ?? ""}
                  onChange={(e) => {
                    const selected = candidates.find(
                      (p) => p.id === e.target.value,
                    );
                    change(
                      editSlide(draft, s.id, {
                        sourceImagePlacementId: selected?.id,
                        sourceImageTeacherSelected: true,
                        mediaIntent: {
                          ...s.mediaIntent!,
                          visualDescription:
                            selected?.altText ||
                            selected?.caption ||
                            "Ảnh nguồn cần đối chiếu trong hoạt động.",
                        },
                      }),
                    );
                  }}
                >
                  <option value="">Chưa chọn ảnh</option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      Ảnh {p.imageOrder + 1} ·{" "}
                      {p.activityTitle ?? "Chưa rõ hoạt động"} ·{" "}
                      {p.altText || p.caption || "Đối chiếu hình"}
                    </option>
                  ))}
                </select>
              </label>
              {p && (
                <p>
                  {p.blockId} · hàng {p.row === undefined ? "—" : p.row + 1} ·
                  cột {p.column === undefined ? "—" : p.column + 1} ·{" "}
                  {p.needsReview ? "Cần đối chiếu" : "Khớp ngữ cảnh hoạt động"}
                </p>
              )}
            </div>
          );
        })}
    </details>
  );
}
