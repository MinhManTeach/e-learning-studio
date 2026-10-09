import { useState } from "react";
import type {
  BlockClassification,
  ImportedLessonDocument,
  PedagogicalAnalysis,
} from "./model";
import { correctionCategories } from "./review";
import { groupedSourceReview } from "./reviewDiagnostics";

export function DocumentDiagnostics({
  document,
  analysis,
  correct,
}: {
  document: ImportedLessonDocument;
  analysis: PedagogicalAnalysis;
  correct: (id: string, category: BlockClassification["category"]) => void;
}) {
  const [choices, setChoices] = useState<
    Record<string, BlockClassification["category"]>
  >({});
  const groups = groupedSourceReview(analysis);
  const uncertain = groups.flatMap((g) => g.items);
  return (
    <>
      {uncertain.length > 0 && (
        <details className="analysis-card uncertain-review">
          <summary>
            <span>
              Cần thầy/cô kiểm tra ·{" "}
              {
                uncertain.filter(
                  (item) =>
                    item.id.startsWith("unmapped-") ||
                    item.classification?.needsReview ||
                    item.classification?.corrected,
                ).length
              }{" "}
              nội dung
            </span>{" "}
            · Tổng đối chiếu: {uncertain.length}
          </summary>
          <p>
            Những đoạn dưới đây chưa có đủ căn cứ để tự phân loại. Chọn nhóm rồi
            chuyển; nội dung sẽ xuất hiện ở mục tương ứng.
          </p>
          {groups.map((group) => (
            <details key={group.key}>
              <summary>
                {group.label} · {group.items.length} nội dung
              </summary>
              {group.items.map((item) => {
                const c = item.classification;
                return (
                  <div className="uncertain-item" key={item.id}>
                    <blockquote>{item.text}</blockquote>
                    <small>
                      {item.severity} · Khối {item.blockId ?? "Chưa có mã"} · Độ
                      tin cậy{" "}
                      {item.confidence === undefined
                        ? "Chưa xác định"
                        : item.confidence.toFixed(2)}
                    </small>
                    <details className="source-trace">
                      <summary>Đối chiếu nguồn · {item.id}</summary>
                      <p>{c?.sourceText ?? item.text}</p>
                      <p>
                        {item.blockId ?? "Chưa có mã nguồn"}
                        {c?.row !== undefined
                          ? ` · hàng ${c.row + 1}, cột ${(c.column ?? 0) + 1}`
                          : ""}
                      </p>
                      <p>
                        Trường: {c?.field || "Chưa phân loại"} · Độ tin cậy{" "}
                        {item.confidence === undefined
                          ? "Chưa xác định"
                          : item.confidence.toFixed(2)}
                      </p>
                      {c?.signals.map((signal, i) => (
                        <p key={i}>{signal}</p>
                      ))}
                    </details>
                    {c?.corrected ? (
                      <p role="status">
                        Đã xử lý bởi giáo viên ·{" "}
                        {correctionCategories.find(
                          (x) => x.value === c.category,
                        )?.label ?? c.category}
                        . Sửa tiếp tại mục tương ứng.
                      </p>
                    ) : c && /^unmappedContent\[\d+\]$/.test(c.field) ? (
                      <div className="correction-actions">
                        <label>
                          Đây là nội dung gì?
                          <select
                            aria-label={`Phân loại ${c.id}`}
                            value={choices[c.id] ?? "OTHER"}
                            onChange={(e) =>
                              setChoices({
                                ...choices,
                                [c.id]: e.target
                                  .value as BlockClassification["category"],
                              })
                            }
                          >
                            {correctionCategories.map((x) => (
                              <option value={x.value} key={x.value}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={() =>
                            correct(c.id, choices[c.id] ?? "OTHER")
                          }
                        >
                          Chuyển vào nhóm đã chọn
                        </button>
                      </div>
                    ) : (
                      <p>Sửa tại mục nội dung tương ứng.</p>
                    )}
                  </div>
                );
              })}
            </details>
          ))}
        </details>
      )}
      {import.meta.env.DEV && (
        <details className="document-debug analysis-card">
          <summary>Kiểm tra phân tích tài liệu</summary>
          <p>
            Dành cho kiểm tra phát triển. Điểm là tổng các tín hiệu quy tắc,
            không phải xác suất nội dung đúng.
          </p>
          <h3>Cấu trúc nguồn ({document.blocks.length} khối)</h3>
          {document.blocks.map((block) => (
            <details key={block.id}>
              <summary>
                {block.sourceOrder + 1} · {block.type} · {block.id}
                {block.level ? ` · cấp ${block.level}` : ""}
              </summary>
              {block.table ? (
                <div className="debug-table-scroll">
                  <table>
                    <tbody>
                      {block.table.rows.map((row, i) => (
                        <tr key={i}>
                          {row.cells.map((cell, j) => (
                            <td
                              key={j}
                              colSpan={cell.colspan}
                              rowSpan={cell.rowspan}
                            >
                              <small>
                                Cột {(cell.column ?? j) + 1} · gộp{" "}
                                {cell.colspan ?? 1}×{cell.rowspan ?? 1}
                              </small>
                              <pre>{cell.text}</pre>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre>{block.text ?? block.items?.join("\n")}</pre>
              )}
            </details>
          ))}
          <h3>Nguồn → Phân loại → Trường → Điểm</h3>
          {analysis.classifications.length === 0 && (
            <p>
              Nguồn văn bản thuần dùng quy tắc dòng; xem các mục “Lấy thông tin
              này từ đâu?”.
            </p>
          )}
          {analysis.classifications.map((c) => (
            <div className="debug-classification" key={c.id}>
              <pre>{c.sourceText}</pre>
              <p>
                {c.blockId}
                {c.row !== undefined
                  ? ` · hàng ${c.row + 1}, cột ${(c.column ?? 0) + 1}`
                  : ""}{" "}
                → {c.isHeading ? "SECTION HEADER · " : ""}
                {c.category} → {c.field || "—"} → {c.confidence.toFixed(2)}
                {c.needsReview ? " · Cần kiểm tra" : ""}
              </p>
              <ul>
                {c.signals.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
