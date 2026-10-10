import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellOff,
  ListOrdered,
  Maximize,
  Minimize,
  Square,
  Volume2,
} from "lucide-react";
import { themes, type LessonProject } from "../model/schema";
import { SlideCanvas } from "../renderers/SlideCanvas";
import {
  canRetry,
  createSession,
  emptyQuiz,
  progress,
  sessionReducer,
  type LessonSessionState,
  type SessionAction,
} from "./session";
import { SessionContext } from "./SessionContext";
import { useSpeech } from "./useSpeech";
import { Celebration } from "./Celebration";
import type { LmsAdapter } from "./lms";
import { decodeResume, lmsReport } from "./resume";

export const themeLabels: Record<(typeof themes)[number], string> = {
  SAFE_TEAL: "Xanh ngọc",
  NAVY: "Xanh hải quân",
  FOCUS_DARK: "Tối tập trung",
  KIDS: "Vui nhộn",
};
const fontSteps = [1, 1.15, 1.3, 1.5];
/** Wide screens keep the table of contents open beside the page. */
const wideScreen = () =>
  typeof window !== "undefined" && window.innerWidth >= 1100;

function restore(project: LessonProject, lms: LmsAdapter) {
  const saved = lms.readSuspendData();
  const state = saved ? decodeResume(project, saved) : null;
  const resumedAt =
    state && state.currentSlideId !== project.slides[0]?.id
      ? project.slides.findIndex((s) => s.id === state.currentSlideId) + 1
      : 0;
  return { state: state ?? createSession(project), resumedAt };
}

/** The student-facing player inside an exported SCORM / HTML5 package. */
export function LessonPlayer({
  project,
  lms,
}: {
  project: LessonProject;
  lms: LmsAdapter;
}) {
  const [initial] = useState(() => restore(project, lms));
  const [studentName] = useState(() => lms.studentName());
  const [session, setSession] = useState<LessonSessionState>(initial.state);
  const [resumedAt, setResumedAt] = useState(initial.resumedAt);
  const [tocOpen, setTocOpen] = useState(wideScreen);
  const [fontStep, setFontStep] = useState(0);
  const [theme, setTheme] = useState(project.settings.theme);
  const [fullscreen, setFullscreen] = useState(false);
  const [sound, setSound] = useState(true);
  const root = useRef<HTMLElement>(null);
  const index = project.slides.findIndex(
    (s) => s.id === session.currentSlideId,
  );
  const slide = project.slides[index];
  const speech = useSpeech(slide);
  const shown = useMemo(
    () => ({ ...project, settings: { ...project.settings, theme } }),
    [project, theme],
  );
  const act = (a: SessionAction) =>
    setSession((s) => sessionReducer(project, s, a));
  const go = (i: number) => {
    const target = project.slides[i];
    if (target) act({ type: "visit", id: target.id });
    // On narrow screens the list covers the page, so close it after choosing.
    if (!wideScreen()) setTocOpen(false);
  };

  useEffect(() => {
    lms.report(lmsReport(project, session));
  }, [lms, project, session]);
  useEffect(() => {
    const close = () => lms.finish();
    window.addEventListener("pagehide", close);
    window.addEventListener("beforeunload", close);
    return () => {
      window.removeEventListener("pagehide", close);
      window.removeEventListener("beforeunload", close);
    };
  }, [lms]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.current?.requestFullscreen?.().catch(() => undefined);
  }
  function review() {
    go(0);
  }
  function retry() {
    const quizzes = project.slides.filter(
      (s) =>
        s.type === "quiz" &&
        canRetry(
          s.data,
          session.quizAttempts[s.id] ?? emptyQuiz(),
          project.settings.allowRetry,
        ),
    );
    if (!quizzes.length) return;
    setSession((s) => {
      const reset = quizzes.reduce(
        (state, q) =>
          sessionReducer(project, state, { type: "quizRetry", id: q.id }),
        s,
      );
      return sessionReducer(project, reset, {
        type: "visit",
        id: quizzes[0].id,
      });
    });
  }
  const percent = progress(project, session);
  const grade = project.metadata.grade.trim();
  const meta = [
    project.metadata.subject,
    /^\d+$/.test(grade) ? `Lớp ${grade}` : grade,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SessionContext.Provider
      value={{ project: shown, session, act, review, retry, studentName }}
    >
      <main
        className="student-preview lesson-player"
        ref={root}
        data-theme={theme}
        data-stage={slide?.pedagogicalStage}
      >
        <header className="player-bar">
          <div className="player-title">
            {meta && <span className="eyebrow">{meta}</span>}
            <h1>{project.metadata.projectTitle}</h1>
          </div>
          <div className="player-tools" role="toolbar" aria-label="Công cụ">
            <button
              onClick={speech.toggle}
              disabled={!speech.available}
              aria-pressed={speech.speaking}
            >
              {speech.speaking ? <Square size={16} /> : <Volume2 size={18} />}
              {speech.speaking ? "Dừng đọc" : "Đọc bài"}
            </button>
            <button
              onClick={() => setTocOpen((x) => !x)}
              aria-expanded={tocOpen}
              aria-controls="player-toc"
            >
              <ListOrdered size={18} /> Mục lục
            </button>
            <span className="font-tools" role="group" aria-label="Cỡ chữ">
              <button
                onClick={() => setFontStep((x) => Math.max(0, x - 1))}
                disabled={fontStep === 0}
                aria-label="Giảm cỡ chữ"
              >
                A−
              </button>
              <button
                onClick={() =>
                  setFontStep((x) => Math.min(fontSteps.length - 1, x + 1))
                }
                disabled={fontStep === fontSteps.length - 1}
                aria-label="Tăng cỡ chữ"
              >
                A+
              </button>
            </span>
            <label className="theme-tool">
              <span>Màu</span>
              <select
                value={theme}
                onChange={(e) =>
                  setTheme(e.target.value as (typeof themes)[number])
                }
              >
                {themes.map((t) => (
                  <option key={t} value={t}>
                    {themeLabels[t]}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setSound((x) => !x)}
              aria-pressed={sound}
              aria-label="Âm thanh khen thưởng"
            >
              {sound ? <Bell size={18} /> : <BellOff size={18} />}
              {sound ? "Âm thanh" : "Tắt tiếng"}
            </button>
            <button onClick={toggleFullscreen}>
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              {fullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            </button>
          </div>
        </header>
        <div className="player-progress">
          <progress aria-label="Tiến độ học" value={percent} max={100} />
          <span>{percent}%</span>
        </div>
        {resumedAt > 0 && (
          <p className="resume-notice" role="status">
            Đang học tiếp từ trang {resumedAt}.{" "}
            <button
              onClick={() => {
                setResumedAt(0);
                go(0);
              }}
            >
              Học lại từ đầu
            </button>
          </p>
        )}
        {/* The stage takes whatever height is left, so the page and the
            navigation buttons fit inside an LMS frame of any size. */}
        <div className="player-body">
          {tocOpen && (
            <nav id="player-toc" className="player-toc" aria-label="Mục lục">
              <ol>
                {project.slides.map((s, i) => (
                  <li key={s.id}>
                    <button
                      onClick={() => go(i)}
                      aria-current={i === index ? "page" : undefined}
                    >
                      <span>{i + 1}.</span> {s.title}
                      {session.visitedSlideIds.includes(s.id) && (
                        <span className="visited" aria-label="đã xem">
                          {theme === "KIDS" ? "⭐" : "✓"}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="player-stage">
            <SlideCanvas
              slide={slide}
              project={shown}
              fontBoost={fontSteps[fontStep]}
            />
          </div>
        </div>
        <div className="player-nav">
          <button onClick={() => go(index - 1)} disabled={index <= 0}>
            <ArrowLeft size={17} /> Trang trước
          </button>
          <span>
            Trang {slide ? index + 1 : 0} / {project.slides.length}
          </span>
          <button
            onClick={() => go(index + 1)}
            disabled={index < 0 || index >= project.slides.length - 1}
          >
            Trang tiếp <ArrowRight size={17} />
          </button>
        </div>
        {speech.notice && <p role="status">{speech.notice}</p>}
        <Celebration sound={sound} />
      </main>
    </SessionContext.Provider>
  );
}
