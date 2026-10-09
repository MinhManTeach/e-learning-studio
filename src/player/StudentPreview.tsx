import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Volume2, Square } from "lucide-react";
import type { LessonProject } from "../model/schema";
import { SlideCanvas } from "../renderers/SlideCanvas";
import {
  createSession,
  sessionReducer,
  progress,
  emptyQuiz,
  canRetry,
  type SessionAction,
} from "./session";
import { SessionContext } from "./SessionContext";
import { useSpeech } from "./useSpeech";
export function StudentPreview({
  project,
  initialId,
}: {
  project: LessonProject;
  initialId: string | null;
}) {
  const [session, setSession] = useState(() =>
    createSession(project, initialId),
  );
  const index = project.slides.findIndex(
    (s) => s.id === session.currentSlideId,
  );
  const slide = project.slides[index];
  const act = (a: SessionAction) =>
    setSession((s) => sessionReducer(project, s, a));
  function navigate(delta: number) {
    const target = project.slides[index + delta];
    if (target) act({ type: "visit", id: target.id });
  }
  const speech = useSpeech(slide);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index]);
  function review() {
    const first = project.slides[0];
    if (first) act({ type: "visit", id: first.id });
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
    setSession((s) =>
      quizzes.reduce(
        (state, q) =>
          sessionReducer(project, state, { type: "quizRetry", id: q.id }),
        s,
      ),
    );
    act({ type: "visit", id: quizzes[0].id });
  }
  return (
    <SessionContext.Provider value={{ project, session, act, review, retry }}>
      <main className="student-preview">
        <div className="preview-heading">
          <div>
            <span className="eyebrow">GÓC NHÌN HỌC SINH</span>
            <h2>{project.metadata.projectTitle}</h2>
          </div>
          <button onClick={speech.toggle} disabled={!speech.available}>
            {speech.speaking ? <Square size={16} /> : <Volume2 size={18} />}{" "}
            {speech.speaking ? "Dừng đọc" : "Đọc bài"}
          </button>
          <button onClick={() => setSession(createSession(project, initialId))}>
            Bắt đầu lại xem trước
          </button>
        </div>
        <div className="progress-label">
          Tiến độ: {progress(project, session)}%
        </div>
        <progress
          aria-label="Tiến độ học"
          value={progress(project, session)}
          max={100}
        />
        <SlideCanvas slide={slide} project={project} />
        <div className="player-nav">
          <button onClick={() => navigate(-1)} disabled={index <= 0}>
            <ArrowLeft size={17} /> Trang trước
          </button>
          <span>
            Trang {slide ? index + 1 : 0} / {project.slides.length}
          </span>
          <button
            onClick={() => navigate(1)}
            disabled={index < 0 || index >= project.slides.length - 1}
          >
            Trang tiếp <ArrowRight size={17} />
          </button>
        </div>
        <p className="hint">
          Dùng phím ← → để chuyển trang khi không chọn điều khiển. Giọng đọc tùy
          thiết bị.
        </p>
        {speech.notice && <p role="status">{speech.notice}</p>}
      </main>
    </SessionContext.Provider>
  );
}
