import { useState } from "react";
import { Volume2 } from "lucide-react";
import type {
  BasicSlide,
  LessonProject,
  SlideItem,
  SlideSound,
} from "../model/schema";
import { isDisplayableUrl, useImageResolver } from "../media/imageResolver";
import { useLessonSession } from "../player/SessionContext";
import { SoundTrigger } from "./SlideSounds";
import { EditableSlide } from "./EditableSlide";
import { useLecture } from "../lecture/LecturePlayer";
import { hasLecture } from "../lecture/model";

/**
 * The teacher's slide as PowerPoint laid it out: every picture and text box at
 * its place, sound pictures clickable, and items with an entrance animation
 * shown one click at a time for students. The editor shows everything, and
 * with `onChange` the teacher moves, resizes and retypes items with the mouse.
 */
export function OriginalSlide({
  slide,
  project,
  onChange,
}: {
  slide: BasicSlide;
  project: LessonProject;
  onChange?: (slide: BasicSlide) => void;
}) {
  const layout = slide.data.original!;
  const student = !!useLessonSession();
  const steps = Math.max(0, ...layout.items.map((i) => i.step ?? 0));
  const [shown, setShown] = useState(0);
  // The teacher's lecture, spoken piece by piece as the clicks come.
  const lecture = useLecture({ slide, project, shown, steps, setShown });
  if (onChange && !student)
    return (
      <EditableSlide
        slide={slide}
        project={project}
        box={{ ...slideBox(layout.ratio), background: layout.background }}
        onChange={(original) =>
          onChange({ ...slide, data: { ...slide.data, original } })
        }
      />
    );
  const sounds = new Map(slide.data.sounds.map((s) => [s.id, s]));
  const waiting = student && shown < steps;
  return (
    <div
      className="original-slide"
      style={{ ...slideBox(layout.ratio), background: layout.background }}
    >
      {layout.items.map((item) => (
        <OriginalItem
          key={item.id}
          item={item}
          project={project}
          sound={item.soundId ? sounds.get(item.soundId) : undefined}
          hidden={student && (item.step ?? 0) > shown}
        />
      ))}
      {waiting && (
        <button
          type="button"
          className="reveal-next original-next"
          onClick={() => {
            setShown(shown + 1);
            lecture.next(shown + 1);
          }}
        >
          Tiếp theo ({shown}/{steps}) ▸
        </button>
      )}
      {student && hasLecture(slide) && lecture.controls}
    </div>
  );
}

/** The slide keeps its own shape inside the 16:9 page. */
export function slideBox(ratio: number): React.CSSProperties {
  const page = 16 / 9;
  const box =
    ratio >= page
      ? { width: 100, height: (page / ratio) * 100 }
      : { width: (ratio / page) * 100, height: 100 };
  return {
    width: `${box.width}%`,
    height: `${box.height}%`,
    left: `${(100 - box.width) / 2}%`,
    top: `${(100 - box.height) / 2}%`,
  };
}

/** A font from PowerPoint, with a look-alike when the device does not have it. */
export function fontStack(font: string | undefined) {
  if (!font) return undefined;
  const serif = /times|cambria|georgia|garamond|serif|book|palatino/i.test(
    font,
  );
  return `"${font.replace(/"/g, "")}", ${serif ? "Georgia, serif" : "Arial, sans-serif"}`;
}
const cqw = (v: number) => `${v}cqw`;

/**
 * Where an item sits and how it looks, in percent of the slide: its box (fill,
 * outline, rounded corners), its turn, and its text (font, size, where it sits).
 */
export function itemStyle(item: SlideItem): React.CSSProperties {
  const flip =
    item.kind === "IMAGE" && (item.flipH || item.flipV)
      ? ` scale(${item.flipH ? -1 : 1}, ${item.flipV ? -1 : 1})`
      : "";
  const turn = item.rotate ? `rotate(${item.rotate}deg)` : "";
  // A drawn shape paints its own fill and outline (see ItemShape).
  const box = !item.path;
  return {
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.w}%`,
    height: `${item.h}%`,
    ...(turn || flip ? { transform: (turn + flip).trim() } : {}),
    ...(item.kind === "TEXT"
      ? {
          fontSize: `calc(${item.size ?? 2.4}cqw * var(--font-scale, 1))`,
          fontFamily: fontStack(item.font),
          color: item.color,
          background: box ? item.fill : undefined,
          border:
            box && item.line
              ? `${cqw(item.line.width)} ${item.line.dash ? "dotted" : "solid"} ${item.line.color}`
              : undefined,
          borderRadius: item.ellipse
            ? "50%"
            : item.radius
              ? cqw(item.radius)
              : undefined,
          fontWeight: item.bold ? 700 : undefined,
          fontStyle: item.italic ? "italic" : undefined,
          textAlign: item.align,
          justifyContent:
            item.valign === "middle"
              ? "center"
              : item.valign === "bottom"
                ? "flex-end"
                : undefined,
          padding: item.pad?.map(cqw).join(" "),
          lineHeight: item.lineHeight,
          whiteSpace: item.nowrap ? "nowrap" : undefined,
        }
      : {}),
  };
}

/** A shape drawn with PowerPoint's own outline (custom geometry). */
export function ItemShape({ item }: { item: SlideItem }) {
  if (!item.path) return null;
  const flip =
    item.flipH || item.flipV
      ? `scale(${item.flipH ? -1 : 1} ${item.flipV ? -1 : 1})`
      : undefined;
  return (
    <svg
      className="original-shape"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={item.path}
        transform={
          flip &&
          `translate(${item.flipH ? 1000 : 0} ${item.flipV ? 1000 : 0}) ${flip}`
        }
        fill={item.fill ?? "none"}
        stroke={item.line?.color}
        strokeWidth={item.line ? `${item.line.width}cqw` : undefined}
        strokeDasharray={item.line?.dash ? "4 4" : undefined}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The text of an item, line by line. */
export const itemLines = (item: SlideItem) =>
  item.text.map((line, i) => <p key={i}>{line}</p>);

function OriginalItem({
  item,
  project,
  sound,
  hidden,
}: {
  item: SlideItem;
  project: LessonProject;
  sound?: SlideSound;
  hidden: boolean;
}) {
  const style: React.CSSProperties = {
    ...itemStyle(item),
    visibility: hidden ? "hidden" : undefined,
  };
  const content =
    item.kind === "IMAGE" ? (
      <ItemPicture item={item} project={project} />
    ) : (
      <>
        <ItemShape item={item} />
        {itemLines(item)}
      </>
    );
  const className = `original-item original-${item.kind.toLowerCase()}`;
  if (sound)
    return (
      <SoundTrigger
        sound={sound}
        project={project}
        className={`${className} original-sound`}
        style={style}
      >
        {content}
        <span className="original-sound-badge" aria-hidden="true">
          <Volume2 />
        </span>
      </SoundTrigger>
    );
  return (
    <div className={className} style={style} aria-hidden={hidden}>
      {content}
    </div>
  );
}

export function ItemPicture({
  item,
  project,
}: {
  item: SlideItem;
  project: LessonProject;
}) {
  const asset = project.assets.find((a) => a.id === item.assetId);
  const resolved = useImageResolver()(asset, project.projectId);
  if (
    !asset ||
    resolved.loading ||
    resolved.error ||
    !isDisplayableUrl(resolved.url, asset.status === "LOCAL")
  )
    return null;
  // A cropped picture is drawn larger and moved, so only its kept part shows.
  const c = item.crop;
  const cropped: React.CSSProperties | undefined = c && {
    position: "absolute",
    maxWidth: "none",
    width: `${100 / (1 - c.l - c.r)}%`,
    height: `${100 / (1 - c.t - c.b)}%`,
    left: `${(-c.l / (1 - c.l - c.r)) * 100}%`,
    top: `${(-c.t / (1 - c.t - c.b)) * 100}%`,
  };
  const picture = (
    <img
      src={resolved.url}
      alt={asset.altText}
      draggable={false}
      style={cropped}
    />
  );
  return cropped ? <span className="original-crop">{picture}</span> : picture;
}
