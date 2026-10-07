import type { Slide } from "../model/schema";
export function TextRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "welcome" && slide.type !== "content") return null;
  const d = slide.data;
  return (
    <>
      <p className="body-text">{d.body}</p>
      {d.paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {!!d.bulletPoints.length && (
        <ul>
          {d.bulletPoints.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {!!d.keywords.length && (
        <div className="keywords">
          {d.keywords.map((k, i) => (
            <span key={i}>{k}</span>
          ))}
        </div>
      )}
      {d.keyTakeaway && <div className="takeaway">✦ {d.keyTakeaway}</div>}
      {!d.body && !d.paragraphs.length && !d.bulletPoints.length && (
        <p className="canvas-placeholder">Hãy thêm nội dung cho trang này.</p>
      )}
    </>
  );
}
export function ObjectivesRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "objectives") return null;
  return (
    <>
      <ul className="outcomes">
        {slide.data.learningOutcomes.map((o, i) => (
          <li key={i}>
            <span aria-hidden="true">{slide.data.icons[i] || "✓"}</span> {o}
          </li>
        ))}
      </ul>
      {slide.data.keyMessages.map((m, i) => (
        <div className="takeaway" key={i}>
          {m}
        </div>
      ))}
    </>
  );
}
export function SummaryRenderer({ slide }: { slide: Slide }) {
  if (slide.type !== "summary") return null;
  return (
    <>
      <div className="summary-grid">
        {slide.data.keyMessages.map((m, i) => (
          <div key={i}>
            <strong>{String(i + 1).padStart(2, "0")}</strong>
            <p>{m}</p>
          </div>
        ))}
        {slide.data.mindMapNodes.map((n) => (
          <div key={n.id}>
            <b>{n.label}</b>
            <p>{n.description}</p>
          </div>
        ))}
      </div>
      <ul>
        {slide.data.safetyTips.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {slide.data.helpChannels
        .filter((h) => h.enabled)
        .map((h) => (
          <div className="help-channel" key={h.id}>
            <strong>
              {h.label}: {h.value}
            </strong>
            <p>{h.description}</p>
          </div>
        ))}
    </>
  );
}
export function LegacyRenderer({ slide }: { slide: Slide }) {
  return (
    <div className="legacy-notice">
      <h3>Hoạt động tham chiếu</h3>
      <p>
        Dữ liệu gốc được giữ nguyên. Loại hoạt động này sẽ được hỗ trợ ở giai
        đoạn sau.
      </p>
      {slide.type === "legacy" && <p>{slide.data.originalType}</p>}
    </div>
  );
}
