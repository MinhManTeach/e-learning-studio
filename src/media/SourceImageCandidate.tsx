import type { AssetReference } from "../model/schema";
import type { DocxImagePlacement } from "../import/mediaModel";
import { useLocalImage } from "./useLocalImage";
export function SourceImageCandidate({
  asset,
  placement,
  projectId,
  preferred,
  disabled,
  choose,
}: {
  asset: AssetReference;
  placement: DocxImagePlacement & {
    activityTitle?: string;
    subactivityTitle?: string;
  };
  projectId: string;
  preferred: boolean;
  disabled: boolean;
  choose: () => void;
}) {
  const image = useLocalImage(asset, projectId);
  return (
    <article>
      {image.url && (
        <img src={image.url} alt={placement.altText || asset.altText} />
      )}
      {image.loading && <p>Đang đọc ảnh KHBD…</p>}
      {image.error && <p role="alert">{image.error}</p>}
      <h4>
        Ảnh nguồn {placement.imageOrder + 1}:{" "}
        {placement.caption || placement.altText || "Minh họa KHBD"}
      </h4>
      <p>
        {preferred
          ? "Ưu tiên: cùng ô nguồn với nội dung trang; cần đối chiếu từng ảnh."
          : "Cần giáo viên đối chiếu nội dung trước khi chọn."}
      </p>
      <p>
        {placement.activityTitle} {placement.subactivityTitle}
      </p>
      <details>
        <summary>Ngữ cảnh nguồn</summary>
        <p>{placement.nearbyText}</p>
        <p>
          {placement.blockId} · hàng{" "}
          {placement.row === undefined ? "—" : placement.row + 1} · cột{" "}
          {placement.column === undefined ? "—" : placement.column + 1} · đoạn{" "}
          {placement.paragraphIndex + 1}
        </p>
      </details>
      <p>{asset.docxSource?.attribution}</p>
      <button
        disabled={disabled || image.loading || !!image.error}
        onClick={choose}
      >
        Chọn ảnh nguồn {placement.imageOrder + 1}
      </button>
    </article>
  );
}
