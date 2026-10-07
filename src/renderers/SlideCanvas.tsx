import { useState, type ComponentType } from "react";
import { BookOpen, ImageOff, Lightbulb, Sparkles } from "lucide-react";
import type { BasicSlide, Slide } from "../model/schema";

function LessonImage({ url, caption }: { url: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  let allowed = false;
  try {
    allowed = ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    /* Invalid URLs render a friendly placeholder. */
  }
  return (
    <figure>
      {!failed && allowed ? (
        <img
          src={url}
          alt={caption || "Hình minh họa bài học"}
          onError={() => setFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="image-fallback">
          <ImageOff size={32} />
          <p>Không tải được hình ảnh</p>
        </div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
function BasicContent({ slide }: { slide: BasicSlide }) {
  return (
    <>
      <div
        className={
          "lesson-content " + (slide.data.imageUrl ? "with-image" : "")
        }
      >
        <div>
          {slide.data.body && <p className="body-text">{slide.data.body}</p>}
          {slide.data.bulletPoints.length > 0 && (
            <ul>
              {slide.data.bulletPoints.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
          {!slide.data.body && !slide.data.bulletPoints.length && (
            <p className="canvas-placeholder">
              Mỗi bài học hay bắt đầu từ một ý tưởng.
              <br />
              Hãy thêm nội dung cho trang này.
            </p>
          )}
        </div>
        {slide.data.imageUrl && (
          <LessonImage
            key={slide.data.imageUrl}
            url={slide.data.imageUrl}
            caption={slide.data.imageCaption}
          />
        )}
      </div>
      {slide.data.keyTakeaway && (
        <div className="takeaway">
          <Lightbulb size={20} />
          <span>{slide.data.keyTakeaway}</span>
        </div>
      )}
    </>
  );
}
function WelcomeRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "welcome") return null;
  return (
    <div className="lesson welcome">
      <div className="welcome-orbit" />
      <div className="lesson-tag">
        <Sparkles size={15} /> CÙNG KHÁM PHÁ BÀI HỌC
      </div>
      <h1>{slide.title || "Trang mở đầu"}</h1>
      <p className="lesson-subtitle">
        {slide.subtitle || "Chào mừng các em đến với bài học hôm nay"}
      </p>
      <BasicContent slide={slide} />
      <div className="welcome-stamp">
        <BookOpen size={20} /> Học điều mới. Mở tương lai.
      </div>
    </div>
  );
}
function ContentRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "content") return null;
  return (
    <div className="lesson content">
      <div className="lesson-tag">{slide.stepName || "KHÁM PHÁ KIẾN THỨC"}</div>
      <h1>{slide.title || "Nội dung bài học"}</h1>
      {slide.subtitle && <p className="lesson-subtitle">{slide.subtitle}</p>}
      <div className="lesson-divider" />
      <BasicContent slide={slide} />
    </div>
  );
}
function LegacyRenderer({ slide }: { slide: Slide }) {
  return (
    <div className="lesson content">
      <div className="lesson-tag">TRANG TỪ BÀI GIẢNG THAM CHIẾU</div>
      <h1>{slide.title}</h1>
      <p>{slide.subtitle}</p>
      <div className="legacy-notice">
        <BookOpen size={32} />
        <h3>Hoạt động này sẽ được hỗ trợ ở giai đoạn sau</h3>
        <p>
          Nội dung gốc đã được giữ nguyên trong bài giảng. Hiện bạn có thể chỉnh
          sửa tiêu đề, lời thuyết minh và ghi chú.
        </p>
      </div>
    </div>
  );
}
export const slideRegistry: Record<
  Slide["type"],
  { label: string; Renderer: ComponentType<{ slide: Slide }> }
> = {
  welcome: { label: "Trang mở đầu", Renderer: WelcomeRenderer },
  content: { label: "Nội dung", Renderer: ContentRenderer },
  legacy: { label: "Hoạt động tham chiếu", Renderer: LegacyRenderer },
};
export function SlideCanvas({ slide }: { slide: Slide | undefined }) {
  const Renderer = slide ? slideRegistry[slide.type].Renderer : null;
  return (
    <div className="canvas" aria-label="Nội dung trang bài giảng">
      {slide && Renderer ? (
        <Renderer slide={slide} />
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
