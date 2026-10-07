import { useState } from "react";
import { Plus, Trash2, CheckCircle2, ChevronDown } from "lucide-react";
import { stageLabels } from "../model/analysis";
import { stages } from "../model/schema";
import type { PedagogicalAnalysis } from "./model";
import { analysisWarnings } from "./review";

export const reviewGroups: {
  title: string;
  description: string;
  fields: {
    key: keyof PedagogicalAnalysis;
    label: string;
    kind: "text" | "number" | "list";
  }[];
}[] = [
  {
    title: "Thông tin bài học",
    description: "Đối chiếu thông tin chung với kế hoạch nguồn.",
    fields: [
      { key: "subject", label: "Môn học", kind: "text" },
      { key: "curriculumGrade", label: "Lớp chương trình", kind: "text" },
      { key: "targetAudienceGrade", label: "Lớp học sinh", kind: "text" },
      { key: "lessonTitle", label: "Tên bài học", kind: "text" },
      { key: "topic", label: "Chủ đề", kind: "text" },
      { key: "durationMinutes", label: "Thời lượng (phút)", kind: "number" },
      { key: "curriculum", label: "Chương trình", kind: "text" },
    ],
  },
  {
    title: "Yêu cầu cần đạt & kiến thức",
    description: "Giữ đúng mục tiêu mà thầy/cô muốn học sinh đạt được.",
    fields: [
      { key: "learningOutcomes", label: "Yêu cầu cần đạt", kind: "list" },
      { key: "knowledgeObjectives", label: "Mục tiêu kiến thức", kind: "list" },
      { key: "keyKnowledge", label: "Nội dung trọng tâm", kind: "list" },
    ],
  },
  {
    title: "Năng lực & phẩm chất",
    description:
      "Các nội dung được phát hiện trong kế hoạch, có thể bổ sung hoặc sửa.",
    fields: [
      { key: "competencies", label: "Năng lực", kind: "list" },
      { key: "qualities", label: "Phẩm chất", kind: "list" },
    ],
  },
  {
    title: "Tích hợp năng lực số / AI",
    description:
      "Đây là nội dung giáo dục trong bài dạy, không phải hoạt động gọi dịch vụ AI.",
    fields: [
      {
        key: "digitalCompetencyIntegration",
        label: "Tích hợp năng lực số",
        kind: "list",
      },
      { key: "aiIntegration", label: "Tích hợp AI", kind: "list" },
    ],
  },
  {
    title: "Hỗ trợ học sinh & đánh giá",
    description: "Kiểm tra phương án hỗ trợ và bằng chứng học tập.",
    fields: [
      {
        key: "specialNeedsSupport",
        label: "Hỗ trợ học sinh đặc thù (HSKT)",
        kind: "list",
      },
      {
        key: "assessmentEvidence",
        label: "Nội dung / minh chứng đánh giá",
        kind: "list",
      },
      { key: "safetyTopics", label: "Nội dung an toàn", kind: "list" },
    ],
  },
  {
    title: "Nội dung cần thầy/cô xem thêm",
    description:
      "Giữ lại nội dung chưa phân loại được; ứng dụng không tự loại bỏ.",
    fields: [
      { key: "sourceWarnings", label: "Lưu ý từ nguồn", kind: "list" },
      {
        key: "unmappedContent",
        label: "Nội dung chưa phân loại",
        kind: "list",
      },
    ],
  },
];
export function AnalysisReview({
  analysis: a,
  edit,
  back,
  reanalyze,
  confirm,
}: {
  analysis: PedagogicalAnalysis;
  edit: (field: keyof PedagogicalAnalysis, value: unknown) => void;
  back: () => void;
  reanalyze: () => void;
  confirm: () => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const warnings = analysisWarnings(a);
  function change(field: keyof PedagogicalAnalysis, value: unknown) {
    setReviewed(false);
    edit(field, value);
  }
  return (
    <>
      <div className="review-intro">
        <span className="eyebrow">BƯỚC 3 · GIÁO VIÊN KIỂM TRA</span>
        <h1>E-Learning Studio đã hiểu kế hoạch của thầy/cô như sau</h1>
        <p>
          Ứng dụng lấy thông tin từ văn bản đã nhập. Thầy/cô kiểm tra và chỉnh
          sửa trước khi xác nhận.
        </p>
      </div>
      {warnings.length > 0 && (
        <aside
          className="analysis-warnings"
          aria-label="Những điểm cần kiểm tra"
        >
          <strong>{warnings.length} điểm cần thầy/cô kiểm tra</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w.code}>{w.message}</li>
            ))}
          </ul>
          <p>
            Các lưu ý không ngăn thầy/cô xác nhận. Thông tin chưa có sẽ được giữ
            trống.
          </p>
        </aside>
      )}
      <div className="review-grid">
        <div className="review-sections">
          {reviewGroups.map((group) => (
            <section className="analysis-card" key={group.title}>
              <h2>{group.title}</h2>
              <p className="section-help">{group.description}</p>
              <div
                className={
                  group.fields[0].kind === "text"
                    ? "analysis-meta-grid"
                    : "analysis-field-grid"
                }
              >
                {group.fields.map((f) => {
                  const traces = a.sourceTraces.filter(
                    (t) => t.field === f.key,
                  );
                  const edited = a.teacherEditedFields.includes(f.key);
                  const value = a[f.key];
                  return (
                    <div className="review-field" key={f.key}>
                      <label>
                        <span>
                          {f.label}
                          {edited && (
                            <small className="teacher-edit">Đã chỉnh sửa</small>
                          )}
                        </span>
                        {f.kind === "list" ? (
                          <textarea
                            rows={Math.min(
                              7,
                              Math.max(3, (value as string[]).length + 1),
                            )}
                            value={(value as string[]).join("\n")}
                            placeholder="Chưa phát hiện trong kế hoạch bài dạy."
                            onChange={(e) =>
                              change(
                                f.key,
                                e.target.value === ""
                                  ? []
                                  : e.target.value.split("\n"),
                              )
                            }
                          />
                        ) : (
                          <input
                            type={f.kind === "number" ? "number" : "text"}
                            min={0}
                            value={value === null ? "" : String(value)}
                            placeholder="Chưa phát hiện"
                            onChange={(e) =>
                              change(
                                f.key,
                                f.kind === "number"
                                  ? e.target.value === ""
                                    ? null
                                    : Math.max(0, Number(e.target.value))
                                  : e.target.value,
                              )
                            }
                          />
                        )}
                      </label>
                      {traces.length > 0 && (
                        <details className="source-trace">
                          <summary>
                            <ChevronDown size={12} />
                            Lấy thông tin này từ đâu?
                          </summary>
                          {traces.map((t, i) => (
                            <blockquote key={i}>
                              <p>{t.sourceText}</p>
                              <small>
                                Dòng {t.lineStart} · Mức đối chiếu:{" "}
                                {t.confidence >= 0.9
                                  ? "Rõ ràng"
                                  : "Cần kiểm tra"}
                              </small>
                            </blockquote>
                          ))}
                          {edited && (
                            <p>
                              Nguồn hiển thị là văn bản ban đầu. Giá trị hiện
                              tại đã được thầy/cô sửa.
                            </p>
                          )}
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          <section className="analysis-card">
            <h2>Hoạt động dạy học</h2>
            <p className="section-help">
              {a.teachingActivities.length
                ? "Kiểm tra trình tự, nội dung và thời lượng từng hoạt động."
                : "Chưa phát hiện trong kế hoạch bài dạy."}
            </p>
            {a.teachingActivities.map((activity, i) => {
              function update(patch: Partial<typeof activity>) {
                change(
                  "teachingActivities",
                  a.teachingActivities.map((x, j) =>
                    i === j ? { ...x, ...patch } : x,
                  ),
                );
              }
              return (
                <div className="review-activity" key={activity.id}>
                  <div className="activity-number">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="activity-fields">
                    <label>
                      <span>Tên hoạt động {i + 1}</span>
                      <input
                        value={activity.title}
                        onChange={(e) => update({ title: e.target.value })}
                      />
                    </label>
                    <div className="analysis-meta-grid">
                      <label>
                        <span>Giai đoạn hoạt động {i + 1}</span>
                        <select
                          value={activity.stage ?? ""}
                          onChange={(e) =>
                            update({
                              stage: e.target.value
                                ? (e.target.value as typeof activity.stage)
                                : null,
                            })
                          }
                        >
                          <option value="">Chưa xác định</option>
                          {stages.map((s) => (
                            <option value={s} key={s}>
                              {stageLabels[s]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Thời lượng hoạt động {i + 1} (phút)</span>
                        <input
                          type="number"
                          min={0}
                          value={activity.estimatedMinutes ?? ""}
                          onChange={(e) =>
                            update({
                              estimatedMinutes:
                                e.target.value === ""
                                  ? null
                                  : Math.max(0, Number(e.target.value)),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      <span>Nội dung hoạt động {i + 1}</span>
                      <textarea
                        rows={3}
                        value={activity.content.join("\n")}
                        onChange={(e) =>
                          update({
                            content: e.target.value
                              ? e.target.value.split("\n")
                              : [],
                          })
                        }
                      />
                    </label>
                    <button
                      onClick={() =>
                        change(
                          "teachingActivities",
                          a.teachingActivities.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={14} />
                      Bỏ hoạt động {i + 1}
                    </button>
                  </div>
                </div>
              );
            })}
            <button
              onClick={() =>
                change("teachingActivities", [
                  ...a.teachingActivities,
                  {
                    id: crypto.randomUUID(),
                    title: "",
                    stage: null,
                    content: [],
                    estimatedMinutes: null,
                  },
                ])
              }
            >
              <Plus size={15} />
              Bổ sung hoạt động
            </button>
          </section>
        </div>
        <aside className="review-guide">
          <div className="analysis-card">
            <CheckCircle2 size={26} />
            <h2>Thầy/cô quyết định nội dung</h2>
            <p>
              Những ô trống là thông tin chưa phát hiện, không phải nội dung ứng
              dụng tự bổ sung.
            </p>
            <p>
              Mỗi mục có thể chỉnh sửa. Các ghi chú nguồn giúp thầy/cô đối chiếu
              với văn bản ban đầu.
            </p>
            <p>
              Giai đoạn này chỉ phân tích kế hoạch; bài giảng hiện có của
              thầy/cô vẫn được giữ nguyên.
            </p>
          </div>
        </aside>
      </div>
      <div className="review-confirm">
        <label className="review-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          <span>Tôi đã kiểm tra và chịu trách nhiệm về nội dung xác nhận.</span>
        </label>
        <div className="wizard-actions">
          <button onClick={back}>Quay lại</button>
          <button onClick={reanalyze}>Phân tích lại</button>
          <button className="primary" disabled={!reviewed} onClick={confirm}>
            Xác nhận & tiếp tục <CheckCircle2 size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
