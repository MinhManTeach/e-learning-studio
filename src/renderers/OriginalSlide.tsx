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

/**
 * The teacher's slide as PowerPoint laid it out: every picture and text box at
 * its place, sound pictures clickable, and items with an entrance animation
 * shown one click at a time for students. The editor shows everything.
 */
export function OriginalSlide({
  slide,
  project,
}: {
  slide: BasicSlide;
  project: LessonProject;
}) {
  const layout = slide.data.original!;
  const student = !!useLessonSession();
  const steps = Math.max(0, ...layout.items.map((i) => i.step ?? 0));
  const [shown, setShown] = useState(0);
  const sounds = new Map(slide.data.sounds.map((s) => [s.id, s]));
  // The slide keeps its own shape inside the 16:9 page.
  const page = 16 / 9;
  const box =
    layout.ratio >= page
      ? { width: 100, height: (page / layout.ratio) * 100 }
      : { width: (layout.ratio / page) * 100, height: 100 };
  const waiting = student && shown < steps;
  return (
    <div
      className="original-slide"
      style={{
        width: `${box.width}%`,
        height: `${box.height}%`,
        left: `${(100 - box.width) / 2}%`,
        top: `${(100 - box.height) / 2}%`,
      }}
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
          onClick={() => setShown(shown + 1)}
        >
          Tiếp theo ({shown}/{steps}) ▸
        </button>
      )}
    </div>
  );
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

function ItemPicture({
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
