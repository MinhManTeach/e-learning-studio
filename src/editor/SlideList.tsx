import { Plus, BookOpen, FileText } from "lucide-react";
import type { Slide, SlideType } from "../model/schema";
import { slideRegistry } from "../renderers/SlideCanvas";
import { availableSlideTypes } from "../slides/registry";
export function SlideList({
  slides,
  selectedId,
  select,
  add,
}: {
  slides: Slide[];
  selectedId: string | null;
  select: (id: string | null) => void;
  add: (type: SlideType) => void;
}) {
  return (
    <aside className="slide-sidebar">
      <div className="panel-heading">
        <h2>BÀI GIẢNG</h2>
        <span className="count">{slides.length} trang</span>
      </div>
      <div className="slide-sidebar-actions">
        <button
          className={"lesson-info " + (!selectedId ? "active" : "")}
          onClick={() => select(null)}
        >
          <BookOpen size={17} /> Thông tin bài giảng
        </button>
        <details className="add-menu">
          <summary>
            <Plus size={18} /> Thêm trang
          </summary>
          {availableSlideTypes.map((type) => (
            <button key={type} onClick={() => add(type)}>
              {slideRegistry[type].label}
            </button>
          ))}
        </details>
      </div>
      <div className="slide-items">
        {slides.map((slide, index) => (
          <button
            className={
              "slide-item " + (slide.id === selectedId ? "selected" : "")
            }
            key={slide.id}
            onClick={() => select(slide.id)}
            aria-pressed={slide.id === selectedId}
          >
            <span className="slide-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className={"mini-slide " + slide.type}>
              <span className="mini-tag">
                {slide.type === "welcome" ? "CÙNG KHÁM PHÁ" : "BÀI HỌC"}
              </span>
              <strong>{slide.title || "Trang chưa đặt tên"}</strong>
              <span className="mini-lines" />
              <span className="mini-lines short" />
            </div>
            <span className="slide-caption">
              <strong>{slide.title || "Trang chưa đặt tên"}</strong>
              <span>
                <FileText size={12} />
                {slideRegistry[slide.type].label}
              </span>
            </span>
          </button>
        ))}
        {!slides.length && (
          <p className="hint">
            Bài giảng chưa có trang. Chọn “Thêm trang” để bắt đầu.
          </p>
        )}
      </div>
      <div className="sidebar-footer">
        <span className="status-dot" /> Không gian sáng tạo của thầy cô
      </div>
    </aside>
  );
}
