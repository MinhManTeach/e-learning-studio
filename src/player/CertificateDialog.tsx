import { useEffect, useRef, useState } from "react";
import { Award, Download, Printer, X } from "lucide-react";
import type { LessonProject } from "../model/schema";
import { certificateCode, formatDateVi } from "./certificate";

const gradeLabel = (grade: string) =>
  /^\d+$/.test(grade.trim()) ? `Lớp ${grade.trim()}` : grade.trim();

interface CertificateText {
  name: string;
  lesson: string;
  meta: string;
  score: string;
  date: string;
  code: string;
  issuer: string;
}

/** Draws the certificate on a canvas; returns false where canvas is unavailable. */
function drawCertificate(canvas: HTMLCanvasElement, t: CertificateText) {
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return false;
  const W = 1600;
  const H = 1131; // A4 landscape proportions
  canvas.width = W;
  canvas.height = H;
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1d705b";
  ctx.lineWidth = 14;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.strokeStyle = "#c9a227";
  ctx.lineWidth = 3;
  ctx.strokeRect(70, 70, W - 140, H - 140);
  const font = '"Segoe UI", Arial, sans-serif';
  const line = (
    text: string,
    y: number,
    size: number,
    color: string,
    bold = false,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? "700 " : ""}${size}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, y, W - 240);
  };
  line("GIẤY CHỨNG NHẬN HOÀN THÀNH", 230, 64, "#1d705b", true);
  line("Chứng nhận học sinh", 340, 34, "#4b5e58");
  line(t.name, 445, 76, "#16332c", true);
  line("đã hoàn thành bài học", 540, 34, "#4b5e58");
  line(t.lesson, 625, 48, "#1d705b", true);
  if (t.meta) line(t.meta, 690, 30, "#4b5e58");
  if (t.score) line(t.score, 780, 40, "#16332c", true);
  line(
    `Ngày cấp: ${t.date}    ·    Mã xác thực: ${t.code}`,
    900,
    28,
    "#4b5e58",
  );
  if (t.issuer) line(t.issuer, 960, 26, "#4b5e58");
  return true;
}

export function CertificateDialog({
  project,
  score,
  hasQuiz,
  defaultName,
  onClose,
}: {
  project: LessonProject;
  score: number;
  hasQuiz: boolean;
  defaultName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [issuedOn] = useState(() => new Date());
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const m = project.metadata;
  const cleanName = name.trim().replace(/\s+/g, " ");
  const text: CertificateText = {
    name: cleanName,
    lesson: m.projectTitle,
    meta: [m.subject, gradeLabel(m.grade)].filter(Boolean).join(" · "),
    score: hasQuiz ? `Điểm kiểm tra: ${score}/100` : "",
    date: formatDateVi(issuedOn),
    code: certificateCode(project.projectId, cleanName, score, issuedOn),
    issuer: [
      m.schoolName && `Trường: ${m.schoolName}`,
      m.teacherName && `Giáo viên: ${m.teacherName}`,
    ]
      .filter(Boolean)
      .join("   ·   "),
  };
  function print() {
    document.body.classList.add("printing-certificate");
    const done = () => {
      document.body.classList.remove("printing-certificate");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    try {
      window.print();
    } finally {
      // Some browsers never fire afterprint; never leave the page hidden.
      setTimeout(done, 1000);
    }
  }
  function download() {
    const canvas = document.createElement("canvas");
    if (!drawCertificate(canvas, text)) {
      setNotice("Trình duyệt này chưa tải được ảnh. Hãy dùng In / Lưu PDF.");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        setNotice("Chưa tạo được ảnh. Hãy dùng In / Lưu PDF.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `giay-chung-nhan-${text.code}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }
  return (
    <div
      className="certificate-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Giấy chứng nhận hoàn thành"
    >
      <div className="certificate-panel">
        <label className="certificate-name">
          <span>Họ và tên học sinh</span>
          <input
            ref={input}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ví dụ: Nguyễn Văn An"
          />
        </label>
        <section className="certificate" aria-label="Giấy chứng nhận">
          <Award className="certificate-icon" aria-hidden="true" />
          <p className="certificate-kicker">GIẤY CHỨNG NHẬN HOÀN THÀNH</p>
          <p>Chứng nhận học sinh</p>
          <p className="certificate-student">{cleanName || "…"}</p>
          <p>đã hoàn thành bài học</p>
          <p className="certificate-lesson">{text.lesson}</p>
          {text.meta && <p>{text.meta}</p>}
          {text.score && <p className="certificate-score">{text.score}</p>}
          <p className="certificate-footer">
            Ngày cấp: {text.date} · Mã xác thực: <strong>{text.code}</strong>
          </p>
          {text.issuer && <p className="certificate-footer">{text.issuer}</p>}
        </section>
        <div className="certificate-actions">
          <button className="primary" disabled={!cleanName} onClick={print}>
            <Printer size={17} /> In / Lưu PDF
          </button>
          <button disabled={!cleanName} onClick={download}>
            <Download size={17} /> Tải ảnh PNG
          </button>
          <button onClick={onClose}>
            <X size={17} /> Đóng
          </button>
        </div>
        {!cleanName && (
          <p className="hint">Nhập họ và tên để in hoặc tải giấy chứng nhận.</p>
        )}
        {notice && <p role="status">{notice}</p>}
      </div>
    </div>
  );
}
