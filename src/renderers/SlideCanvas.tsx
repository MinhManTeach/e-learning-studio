import { useState } from "react";
import { BookOpen, ImageOff } from "lucide-react";
import type { LessonProject, Slide } from "../model/schema";
import { effectiveLayout, stageLabels } from "../model/analysis";
import { slideRegistry } from "../slides/registry";
export { slideRegistry } from "../slides/registry";
export function LessonImage({
  url,
  alt,
  caption,
}: {
  url: string;
  alt: string;
  caption: string;
}) {
  const [failed, setFailed] = useState(false);
  let allowed = false;
  try {
    allowed = ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    /* Invalid URLs render safe fallback. */
  }
  return (
    <figure>
      {allowed && !failed ? (
        <img
          src={url}
          alt={alt || caption || "Hình minh họa bài học"}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="image-fallback">
          <ImageOff />
          <p>Không tải được hình ảnh. Hãy kiểm tra kết nối hoặc đường dẫn.</p>
        </div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
export function SlideCanvas({
  slide,
  project,
}: {
  slide: Slide | undefined;
  project: LessonProject;
}) {
  const Renderer = slide ? slideRegistry[slide.type].Renderer : null;
  const asset = slide?.media.enabled
    ? project.assets.find(
        (a) => a.id === slide.media.assetId && a.kind === "IMAGE",
      )
    : undefined;
  const layout = slide ? effectiveLayout(slide, !!asset) : "TEXT_ONLY";
  const image =
    asset && slide?.media.enabled ? (
      <LessonImage
        key={asset.url}
        url={asset.url}
        alt={asset.altText}
        caption={slide.media.caption}
      />
    ) : null;
  return (
    <div
      className="canvas"
      data-theme={project.settings.theme}
      data-contrast={slide?.accessibility.highContrast ? "high" : undefined}
      aria-label="Nội dung trang bài giảng"
    >
      {slide && Renderer ? (
        <article
          className={"lesson phase1 " + slide.type}
          style={
            {
              "--font-scale": slide.accessibility.fontScale,
            } as React.CSSProperties
          }
        >
          <div className="lesson-tag">
            {slide.pedagogicalStage
              ? stageLabels[slide.pedagogicalStage]
              : slide.stepName}
          </div>
          <h1>{slide.title}</h1>
          {slide.subtitle && (
            <p className="lesson-subtitle">{slide.subtitle}</p>
          )}
          <div className={"slide-layout layout-" + layout} data-layout={layout}>
            {layout !== "TEXT_ONLY" && image && (
              <div className="layout-media">{image}</div>
            )}
            <div className="layout-text">
              <Renderer slide={slide} />
            </div>
          </div>
        </article>
      ) : (
        <div className="empty-canvas">
          <BookOpen size={42} />
          <h2>Không gian cho bài học của bạn</h2>
          <p>Chọn một trang hoặc thêm trang mới để bắt đầu.</p>
        </div>
      )}
    </div>
  );
}
