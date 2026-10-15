import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Volume2 } from "lucide-react";
import type {
  BasicSlide,
  LessonProject,
  SlideItem,
  SlideLayout,
} from "../model/schema";
import { ItemPicture, ItemShape, itemLines, itemStyle } from "./OriginalSlide";

type Drag = {
  id: string;
  mode: "move" | "resize";
  x: number;
  y: number;
  start: SlideItem;
};

const round = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * The teacher's slide in the editor, worked like PowerPoint: click an item to
 * pick it, drag to move, drag the corner to resize, double-click text to type.
 * Every change is one edit of the page; nothing changes for the student.
 */
export function EditableSlide({
  slide,
  project,
  box,
  onChange,
}: {
  slide: BasicSlide;
  project: LessonProject;
  box: React.CSSProperties;
  onChange: (layout: SlideLayout) => void;
}) {
  const layout = slide.data.original!;
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // The items while a drag is under way; saved once on release.
  const [moving, setMoving] = useState<SlideItem[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const items = moving ?? layout.items;
  // The buttons sit above the slide in the editor, never over its content.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById("slide-edit-tools")), []);
  const picked = items.find((i) => i.id === selected);

  const save = (next: SlideItem[]) => onChange({ ...layout, items: next });
  const change = (id: string, patch: Partial<SlideItem>) =>
    save(layout.items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: string) => {
    save(layout.items.filter((i) => i.id !== id));
    setSelected(null);
  };
  const reorder = (id: string, front: boolean) => {
    const item = layout.items.find((i) => i.id === id)!;
    const rest = layout.items.filter((i) => i.id !== id);
    save(front ? [...rest, item] : [item, ...rest]);
  };
  const addText = () => {
    const item: SlideItem = {
      id: crypto.randomUUID(),
      kind: "TEXT",
      x: 30,
      y: 40,
      w: 40,
      h: 12,
      text: ["Chữ mới"],
      size: 3,
    };
    save([...layout.items, item]);
    setSelected(item.id);
    setTyping(item.id);
  };

  const begin = (
    e: React.PointerEvent,
    item: SlideItem,
    mode: Drag["mode"],
  ) => {
    if (typing === item.id || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(item.id);
    setTyping(null);
    area.current?.focus({ preventScroll: true });
    drag.current = {
      id: item.id,
      mode,
      x: e.clientX,
      y: e.clientY,
      start: item,
    };
    // Followed on the window, so a fast drag off the item or the slide still
    // moves it, and clicks and double-clicks reach the item as usual.
    let last: SlideItem[] | null = null;
    const move = (ev: PointerEvent) => {
      // A click that does not move changes nothing.
      if (ev.clientX === e.clientX && ev.clientY === e.clientY) return;
      last = dragged(ev) ?? last;
      if (last) setMoving(last);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      drag.current = null;
      setMoving(null);
      if (last) save(last);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  /** The items as they are with the drag at this pointer position. */
  const dragged = (e: PointerEvent) => {
    const d = drag.current;
    const rect = area.current?.getBoundingClientRect();
    if (!d || !rect?.width || !rect.height) return null;
    const dx = ((e.clientX - d.x) / rect.width) * 100;
    const dy = ((e.clientY - d.y) / rect.height) * 100;
    const s = d.start;
    let next: Partial<SlideItem>;
    if (d.mode === "move")
      // Part of the item always stays on the slide, so it can be picked again.
      next = {
        x: round(clamp(s.x + dx, 3 - s.w, 97)),
        y: round(clamp(s.y + dy, 3 - s.h, 97)),
      };
    else {
      const w = Math.max(2, s.w + dx);
      // Pictures keep their shape, as in PowerPoint; Shift frees them.
      const h =
        s.kind === "IMAGE" && !e.shiftKey && s.w > 0
          ? (w * s.h) / s.w
          : Math.max(2, s.h + dy);
      next = { w: round(w), h: round(h) };
    }
    return layout.items.map((i) => (i.id === d.id ? { ...i, ...next } : i));
  };
  const keys = (e: React.KeyboardEvent) => {
    if (!picked || typing) return;
    const step = e.shiftKey ? 2 : 0.5;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key in nudge) {
      e.preventDefault();
      const [dx, dy] = nudge[e.key];
      change(picked.id, {
        x: round(picked.x + dx),
        y: round(picked.y + dy),
      });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove(picked.id);
    } else if (e.key === "Escape") setSelected(null);
    else if (e.key === "Enter" && picked.kind === "TEXT") {
      e.preventDefault();
      setTyping(picked.id);
    }
  };

  const toolbar = (
    <div className="edit-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" onClick={addText}>
        + Thêm chữ
      </button>
      {picked && (
        <>
          {picked.kind === "TEXT" && (
            <>
              <button
                type="button"
                title="Chữ nhỏ hơn"
                onClick={() =>
                  change(picked.id, {
                    size: round(Math.max(0.8, (picked.size ?? 2.4) / 1.15)),
                  })
                }
              >
                A−
              </button>
              <button
                type="button"
                title="Chữ to hơn"
                onClick={() =>
                  change(picked.id, {
                    size: round(Math.min(30, (picked.size ?? 2.4) * 1.15)),
                  })
                }
              >
                A+
              </button>
              <button
                type="button"
                aria-pressed={!!picked.bold}
                title="Chữ đậm"
                onClick={() => change(picked.id, { bold: !picked.bold })}
              >
                <b>B</b>
              </button>
              <button type="button" onClick={() => setTyping(picked.id)}>
                Sửa chữ
              </button>
            </>
          )}
          <button type="button" onClick={() => reorder(picked.id, true)}>
            Đưa lên trên
          </button>
          <button type="button" onClick={() => reorder(picked.id, false)}>
            Đưa xuống dưới
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => remove(picked.id)}
          >
            Xoá
          </button>
        </>
      )}
    </div>
  );
  return (
    <>
      <div
        ref={area}
        className="original-slide editing"
        style={box}
        tabIndex={0}
        role="application"
        aria-label="Trang slide: bấm để chọn, kéo để di chuyển, kéo góc để đổi cỡ, bấm đúp vào chữ để sửa"
        onPointerDown={() => {
          setSelected(null);
          setTyping(null);
        }}
        onKeyDown={keys}
      >
        {items.map((item) => {
          const chosen = item.id === selected;
          // The slide design (background, frames) stays put and is not picked.
          if (item.locked)
            return (
              <div
                key={item.id}
                className={`original-item original-${item.kind.toLowerCase()} locked`}
                style={itemStyle(item)}
              >
                {item.kind === "IMAGE" ? (
                  <ItemPicture item={item} project={project} />
                ) : (
                  <>
                    <ItemShape item={item} />
                    {itemLines(item)}
                  </>
                )}
              </div>
            );
          return (
            <div
              key={item.id}
              className={
                `original-item original-${item.kind.toLowerCase()} edit-item` +
                (chosen ? " chosen" : "")
              }
              style={itemStyle(item)}
              data-item={item.id}
              onPointerDown={(e) => begin(e, item, "move")}
              onDoubleClick={() => item.kind === "TEXT" && setTyping(item.id)}
            >
              {item.kind === "IMAGE" ? (
                <ItemPicture item={item} project={project} />
              ) : typing === item.id ? (
                <TextTyping
                  item={item}
                  onDone={(text) => {
                    setTyping(null);
                    if (text.length) change(item.id, { text });
                    else remove(item.id);
                  }}
                />
              ) : (
                <>
                  <ItemShape item={item} />
                  {itemLines(item)}
                </>
              )}
              {item.soundId && (
                <span className="original-sound-badge" aria-hidden="true">
                  <Volume2 />
                </span>
              )}
              {!!item.step && (
                <span
                  className="edit-step"
                  title={`Hiện ra ở lần bấm thứ ${item.step}`}
                >
                  {item.step}
                </span>
              )}
              {chosen && (
                <span
                  className="edit-handle"
                  aria-hidden="true"
                  onPointerDown={(e) => begin(e, item, "resize")}
                />
              )}
            </div>
          );
        })}
      </div>
      {slot ? createPortal(toolbar, slot) : toolbar}
    </>
  );
}

/** Typing in a text box of the slide; Esc or a click elsewhere saves it. */
function TextTyping({
  item,
  onDone,
}: {
  item: SlideItem;
  onDone: (text: string[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.innerText = item.text.join("\n");
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Only the text the box opened with; typing is read on save.
  }, []);
  const finish = () => {
    const lines = (box.current?.innerText ?? "")
      .split("\n")
      .map((l) => l.trim());
    while (lines.length && !lines.at(-1)) lines.pop();
    onDone(lines);
  };
  return (
    <div
      ref={box}
      className="edit-typing"
      contentEditable
      suppressContentEditableWarning
      aria-label="Sửa chữ trên slide"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") box.current?.blur();
      }}
      onBlur={finish}
    />
  );
}
