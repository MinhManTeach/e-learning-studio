import { useEffect, useRef, useState, type ReactNode } from "react";
import { Volume2, Square } from "lucide-react";
import type { LessonProject, Slide, SlideSound } from "../model/schema";
import { isDisplayableUrl, useImageResolver } from "../media/imageResolver";

/**
 * Sounds of a page (from PowerPoint or added by the teacher). On a full-page
 * slide picture a sound with an `area` is a see-through spot over the picture
 * where PowerPoint had it; every other sound is a button.
 */
export function SlideSounds({
  slide,
  project,
  cover,
}: {
  slide: Slide;
  project: LessonProject;
  cover: boolean;
}) {
  if (slide.type !== "content" && slide.type !== "welcome") return null;
  // Sounds played by clicking a picture of the original slide live on that picture.
  const linked = new Set(
    slide.data.original?.items.map((i) => i.soundId).filter(Boolean),
  );
  const sounds = slide.data.sounds.filter(
    (s) =>
      !linked.has(s.id) &&
      project.assets.some((a) => a.id === s.assetId && a.kind === "AUDIO"),
  );
  if (!sounds.length) return null;
  const spots = cover ? sounds.filter((s) => s.area) : [];
  const buttons = sounds.filter((s) => !spots.includes(s));
  // Spots are measured on the slide; the picture keeps the slide's shape
  // inside the 16:9 page (object-fit: contain), so place them in that box.
  const ratio = spots[0]?.area?.slideRatio ?? 16 / 9;
  const page = 16 / 9;
  const box =
    ratio >= page
      ? { width: 100, height: (page / ratio) * 100 }
      : { width: (ratio / page) * 100, height: 100 };
  return (
    <>
      {!!spots.length && (
        <div
          className="sound-spots"
          style={{
            width: `${box.width}%`,
            height: `${box.height}%`,
            left: `${(100 - box.width) / 2}%`,
            top: `${(100 - box.height) / 2}%`,
          }}
        >
          {spots.map((s) => (
            <SoundButton key={s.id} sound={s} project={project} spot />
          ))}
        </div>
      )}
      {!!buttons.length && (
        <div className={"sound-buttons" + (cover ? " over-cover" : "")}>
          {buttons.map((s) => (
            <SoundButton key={s.id} sound={s} project={project} />
          ))}
        </div>
      )}
    </>
  );
}

function SoundButton({
  sound,
  project,
  spot = false,
}: {
  sound: SlideSound;
  project: LessonProject;
  spot?: boolean;
}) {
  return (
    <SoundTrigger
      sound={sound}
      project={project}
      className={spot ? "sound-spot" : "sound-button primary"}
      style={
        spot && sound.area
          ? {
              left: `${sound.area.x}%`,
              top: `${sound.area.y}%`,
              width: `${sound.area.w}%`,
              height: `${sound.area.h}%`,
            }
          : undefined
      }
      icon
    >
      {!spot && <span>{sound.label || "Âm thanh"}</span>}
    </SoundTrigger>
  );
}

/** A button that plays (and stops) one sound of the page. */
export function SoundTrigger({
  sound,
  project,
  className,
  style,
  icon = false,
  children,
}: {
  sound: SlideSound;
  project: LessonProject;
  className: string;
  style?: React.CSSProperties;
  /** Show a speaker (or stop) icon before the content. */
  icon?: boolean;
  children?: ReactNode;
}) {
  const asset = project.assets.find(
    (a) => a.id === sound.assetId && a.kind === "AUDIO",
  );
  const resolved = useImageResolver()(asset, project.projectId);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const usable =
    !!asset &&
    !resolved.loading &&
    !resolved.error &&
    isDisplayableUrl(resolved.url, asset.status === "LOCAL");
  // Leaving the page stops its sounds.
  useEffect(() => () => audio.current?.pause(), []);
  const toggle = () => {
    const el = audio.current;
    if (!el || !usable) return;
    if (el.paused) {
      el.currentTime = 0;
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  };
  const label = sound.label || "Âm thanh";
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={playing ? `Dừng: ${label}` : `Nghe: ${label}`}
      aria-pressed={playing}
      title={label}
      disabled={!usable}
      onClick={toggle}
    >
      {icon && (playing ? <Square size={16} /> : <Volume2 size={16} />)}
      {children}
      {usable && (
        <audio
          ref={audio}
          src={resolved.url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      )}
    </button>
  );
}
