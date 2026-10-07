import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Volume2, Square } from "lucide-react";
import type { LessonProject } from "../model/schema";
import { SlideCanvas } from "../renderers/SlideCanvas";
export function StudentPreview({
  project,
  initialId,
}: {
  project: LessonProject;
  initialId: string | null;
}) {
  const [index, setIndex] = useState(
    Math.max(
      0,
      project.slides.findIndex((s) => s.id === initialId),
    ),
  );
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const slide = project.slides[index];
  useEffect(() => {
    setSpeaking(false);
    window.speechSynthesis?.cancel();
    return () => window.speechSynthesis?.cancel();
  }, [index]);
  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (event.key === "ArrowRight")
        setIndex((i) => Math.min(project.slides.length - 1, i + 1));
    }
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [project.slides.length]);
  function speak() {
    if (!("speechSynthesis" in window)) {
      setNotice("Trình duyệt này chưa hỗ trợ đọc bài.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(
      slide?.voiceScript || slide?.title || "",
    );
    utterance.lang = "vi-VN";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setNotice(
        "Chưa thể đọc bài. Hãy kiểm tra giọng tiếng Việt trên thiết bị.",
      );
    };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  return (
    <main className="student-preview">
      <div className="preview-heading">
        <div>
          <span className="eyebrow">GÓC NHÌN HỌC SINH</span>
          <h2>{project.metadata.projectTitle}</h2>
        </div>
        <button onClick={speak} disabled={!slide}>
          {speaking ? <Square size={16} /> : <Volume2 size={18} />}{" "}
          {speaking ? "Dừng đọc" : "Đọc bài"}
        </button>
      </div>
      <SlideCanvas slide={slide} />
      <div className="player-nav">
        <button onClick={() => setIndex((i) => i - 1)} disabled={index <= 0}>
          <ArrowLeft size={17} /> Trang trước
        </button>
        <span>
          Trang {slide ? index + 1 : 0} / {project.slides.length}
        </span>
        <button
          onClick={() => setIndex((i) => i + 1)}
          disabled={index >= project.slides.length - 1}
        >
          <span>Trang tiếp</span>
          <ArrowRight size={17} />
        </button>
      </div>
      <p className="hint">
        Dùng phím ← → để chuyển trang. Giọng đọc tùy thuộc thiết bị.
      </p>
      {notice && <p role="status">{notice}</p>}
    </main>
  );
}
