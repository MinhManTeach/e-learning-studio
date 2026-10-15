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
  if (onChange && !student)
    return (
      <EditableSlide
        slide={slide}
        project={project}
        box={slideBox(layout.ratio)}
        onChange={(original) =>
          onChange({ ...slide, data: { ...slide.data, original } })
        }
      />
    );
  const sounds = new Map(slide.data.sounds.map((s) => [s.id, s]));
  const waiting = student && shown < steps;
  return (
    <div className="original-slide" style={slideBox(layout.ratio)}>
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
          onClick={() => setShown(shown + 1)}
        >
          Tiếp theo ({shown}/{steps}) ▸
        </button>
      )}
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

/** Where an item sits and how its text looks, in percent of the slide. */
export function itemStyle(item: SlideItem): React.CSSProperties {
  return {
    left: `${item.x}%`,
    top: `${item.y}%`,
    width: `${item.w}%`,
    height: `${item.h}%`,
    ...(item.kind === "TEXT"
      ? {
          fontSize: `calc(${item.size ?? 2.4}cqw * var(--font-scale, 1))`,
          color: item.color,
          background: item.fill,
          fontWeight: item.bold ? 800 : undefined,
          textAlign: item.align,
        }
      : {}),
  };
}

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
      item.text.map((line, i) => <p key={i}>{line}</p>)
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
  return <img src={resolved.url} alt={asset.altText} draggable={false} />;
}
