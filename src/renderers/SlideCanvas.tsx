import { useState } from "react";
import { BookOpen, ImageOff } from "lucide-react";
import type { LessonProject, Slide } from "../model/schema";
import { effectiveLayout, stageLabels } from "../model/analysis";
import { slideRegistry } from "../slides/registry";
import { isDisplayableUrl, useImageResolver } from "../media/imageResolver";
import { LessonProjectContext } from "./lessonContext";
export { slideRegistry } from "../slides/registry";
export function LessonImage({
  url,
  alt,
  caption,
  local = false,
}: {
  url: string;
  alt: string;
  caption: string;
  local?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const allowed = isDisplayableUrl(url, local);
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
      {caption && (
        <figcaption>
          {caption.length > 160 ? (
            <details>
              <summary>Ghi công &amp; nguồn ảnh</summary>
              <p>{caption}</p>
            </details>
          ) : (
            caption
          )}
        </figcaption>
      )}
    </figure>
  );
}
/** A lesson video from the package or this device; never a teacher-typed file path. */
export function LessonVideo({
  url,
  label,
  caption,
  local = false,
}: {
  url: string;
  label: string;
  caption: string;
  local?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const allowed = isDisplayableUrl(url, local);
  return (
    <figure className="lesson-video">
      {allowed && !failed ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label={label || caption || "Video bài học"}
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="image-fallback">
          <ImageOff />
          <p>Không phát được video. Hãy kiểm tra tệp hoặc kết nối mạng.</p>
        </div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
export function SlideCanvas({
  slide,
  project,
  fontBoost = 1,
}: {
  slide: Slide | undefined;
  project: LessonProject;
  /** Extra text size chosen by the student in the exported player. */
  fontBoost?: number;
}) {
  const Renderer = slide ? slideRegistry[slide.type].Renderer : null;
  const asset = slide?.media.enabled
    ? project.assets.find(
        (a) =>
          a.id === slide.media.assetId &&
          (a.kind === "IMAGE" || a.kind === "VIDEO"),
      )
    : undefined;
  const resolveImage = useImageResolver();
  const resolved = resolveImage(asset, project.projectId);
  const layout = slide
    ? effectiveLayout(slide, !!asset && !resolved.error)
    : "TEXT_ONLY";
  const image =
    asset && slide?.media.enabled ? (
      resolved.loading ? (
        <p role="status">Đang đọc ảnh trên thiết bị…</p>
      ) : resolved.error ? (
        <p role="alert">{resolved.error}</p>
      ) : asset.kind === "VIDEO" ? (
        <LessonVideo
          key={resolved.url}
          url={resolved.url}
          local={asset.status === "LOCAL"}
          label={asset.altText || asset.name}
          caption={slide.media.caption}
        />
      ) : (
        <LessonImage
          key={resolved.url}
          url={resolved.url}
          local={asset.status === "LOCAL"}
          alt={asset.altText}
          caption={slide.media.caption}
        />
      )
    ) : null;
  return (
    <LessonProjectContext.Provider value={project}>
      <div
        className="canvas"
        data-theme={project.settings.theme}
        data-stage={slide?.pedagogicalStage}
        data-contrast={slide?.accessibility.highContrast ? "high" : undefined}
        aria-label="Nội dung trang bài giảng"
      >
        {slide && Renderer && layout === "MEDIA_COVER" && image ? (
          // The teacher's own slide picture (or a video) fills the 16:9 page; the
          // text stays in the page for screen readers, read-aloud and search.
          <article
            className={"lesson phase1 cover " + slide.type}
            style={
              {
                "--font-scale": slide.accessibility.fontScale * fontBoost,
              } as React.CSSProperties
            }
          >
            <h1 className="visually-hidden">{slide.title}</h1>
            <div className="cover-media">{image}</div>
            <div className="visually-hidden">
              <Renderer key={slide.id} slide={slide} />
            </div>
          </article>
        ) : slide && Renderer ? (
          <article
            className={"lesson phase1 " + slide.type}
            style={
              {
                "--font-scale": slide.accessibility.fontScale * fontBoost,
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
            {resolved.error && <p role="alert">{resolved.error}</p>}
            <div
              className={"slide-layout layout-" + layout}
              data-layout={layout}
            >
              {layout !== "TEXT_ONLY" && image && (
                <div className="layout-media">{image}</div>
              )}
              <div className="layout-text">
                <Renderer key={slide.id} slide={slide} />
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
    </LessonProjectContext.Provider>
  );
}
