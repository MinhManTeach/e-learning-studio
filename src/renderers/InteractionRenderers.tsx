import type { Slide } from "../model/schema";
import { useEffect, useRef, useState } from "react";
import { wordCount } from "../quality/analyzer";
import { ChoicePicture } from "./ChoicePicture";
import { certificateStatus } from "../player/certificate";
import { CertificateDialog } from "../player/CertificateDialog";
import { useLessonSession } from "../player/SessionContext";
import { celebrate } from "../player/celebrate";
import { SpeakButton } from "../player/SpeakButton";
import {
  canReadAloud,
  joinSpeech,
  questionSpeech,
} from "../player/readAloud";
import {
  calculateQuizScore,
  canRetry,
  emptyQuiz,
  orderedOptions,
  orderedQuestions,
  aggregateQuiz,
  deriveCompletionState,
} from "../player/session";
export function WarmupRenderer({ slide }: { slide: Slide }) {
  const runtime = useLessonSession();
  if (slide.type !== "warmup") return null;
  const selected = runtime?.session.interactions[slide.id]?.selectedIds ?? [];
  return (
    <>
      <div className="speak-line">
        <h3>{slide.data.question}</h3>
        {canReadAloud(slide) && (
          <SpeakButton
            id={"warmup:" + slide.id}
            label="câu hỏi"
            lang={slide.narration.lang}
            text={joinSpeech([
              slide.data.question,
              slide.data.instruction,
              ...slide.data.items.map((i) => i.label),
            ])}
          />
        )}
      </div>
      <p>{slide.data.instruction}</p>
      <div className="activity-grid">
        {slide.data.items.map((item) => (
          <div key={item.id}>
            <button
              disabled={!runtime}
              onClick={() =>
                runtime?.act({ type: "warmup", id: slide.id, itemId: item.id })
              }
              aria-pressed={selected.includes(item.id)}
            >
              <ChoicePicture assetId={item.imageAssetId} />
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
            {selected.includes(item.id) && (
              <p role="status">
                {item.isValid ? "✓ Phù hợp" : "! Cùng suy nghĩ lại"} —{" "}
                {item.feedback}
              </p>
            )}
          </div>
        ))}
      </div>
      {!runtime && (
        <p className="hint">Mở Xem trước để trải nghiệm hoạt động.</p>
      )}
    </>
  );
}
export function ScenarioRenderer({ slide }: { slide: Slide }) {
  const rt = useLessonSession();
  const [decision, setDecision] = useState(false);
  const decisions = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const selected = rt?.session.interactions[slide.id]?.choiceId;
  useEffect(() => {
    if (decision) decisions.current?.querySelector("button")?.focus();
  }, [decision]);
  useEffect(() => {
    if (selected) feedback.current?.focus();
  }, [selected]);
  if (slide.type !== "scenario") return null;
  const choice = slide.data.choices.find((x) => x.id === selected);
  const stepped =
    !!rt &&
    (wordCount(slide.data.situation) > 55 ||
      slide.data.choices.reduce((n, c) => n + wordCount(c.text), 0) > 80);
  const showDecision = !stepped || decision || !!choice;
  return (
    <>
      <p className="scenario-context">
        {slide.data.character} · {slide.data.context}
      </p>
      {(!showDecision || !stepped) && slide.data.situation.trim() && (
        <div className="speak-line">
          <p className="scenario-situation">{slide.data.situation}</p>
          {canReadAloud(slide) && (
            <SpeakButton
              id={"situation:" + slide.id}
              label="tình huống"
              lang={slide.narration.lang}
              text={slide.data.situation}
            />
          )}
        </div>
      )}
      {stepped && !showDecision && (
        <button className="primary" onClick={() => setDecision(true)}>
          Đọc xong — chọn cách xử lý
        </button>
      )}
      {stepped && showDecision && (
        <details className="scenario-source">
          <summary>Xem lại tình huống</summary>
          <p>{slide.data.situation}</p>
        </details>
      )}
      {showDecision && (
        <>
          <div className="speak-line">
            <h3>{slide.data.question}</h3>
            {canReadAloud(slide) && (
              <SpeakButton
                id={"decision:" + slide.id}
                label="câu hỏi và các cách xử lý"
                lang={slide.narration.lang}
                text={joinSpeech([
                  slide.data.question,
                  ...slide.data.choices.map((c) => `${c.label}. ${c.text}`),
                ])}
              />
            )}
          </div>
          {(!stepped || !choice) && (
            <div ref={decisions} className="activity-grid scenario-choices">
              {slide.data.choices.map((c) => (
                <button
                  key={c.id}
                  disabled={!rt || !!choice}
                  aria-pressed={selected === c.id}
                  onClick={() => {
                    rt?.act({ type: "scenario", id: slide.id, choiceId: c.id });
                    if (rt) celebrate(c.isRecommended ? "right" : "retry");
                  }}
                >
                  <ChoicePicture assetId={c.imageAssetId} />
                  <strong>{c.label}.</strong>
                  {c.text}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {choice && (
        <div ref={feedback} tabIndex={-1} className="feedback" role="status">
          <strong>
            {choice.isRecommended
              ? "✓ Cách xử lý được khuyến nghị"
              : "! Hãy cân nhắc cách xử lý khác"}
          </strong>
          {stepped && (
            <p>
              <b>Em đã chọn {choice.label}:</b> {choice.text}
            </p>
          )}
          <p>{choice.feedback}</p>
          <p>
            <b>Kết quả:</b> {choice.consequence}
          </p>
          {slide.data.allowRetry && rt?.project.settings.allowRetry && (
            <button
              onClick={() => rt.act({ type: "scenarioRetry", id: slide.id })}
            >
              Thử lại tình huống
            </button>
          )}
        </div>
      )}
    </>
  );
}
export function QuizRenderer({ slide }: { slide: Slide }) {
  const rt = useLessonSession();
  if (slide.type !== "quiz") return null;
  const state = rt?.session.quizAttempts[slide.id] ?? emptyQuiz();
  const attempt = state.history.length;
  const result = state.submitted ? state.history.at(-1)?.result : undefined;
  const showReview =
    state.submitted &&
    slide.data.allowReview &&
    slide.data.showFeedbackAfterSubmit;
  return (
    <div className="quiz-renderer">
      <p>{slide.data.instructions}</p>
      <p className="quiz-meta">
        Ngưỡng đạt: {slide.data.passingScore}% · {slide.data.questions.length}{" "}
        câu · Lượt{" "}
        {state.submitted ? state.history.length : state.history.length + 1}
        {slide.data.attemptsAllowed ? ` / ${slide.data.attemptsAllowed}` : ""}
      </p>
      {orderedQuestions(
        slide.data,
        state.submitted ? Math.max(0, attempt - 1) : attempt,
      ).map((q, i) => (
        <fieldset key={q.id}>
          <legend>
            Câu {i + 1}. {q.prompt} <small>({q.points} điểm)</small>
          </legend>
          {canReadAloud(slide) && (
            <SpeakButton
              id={"question:" + q.id}
              label={`câu ${i + 1}`}
              lang={slide.narration.lang}
              text={questionSpeech(
                {
                  ...q,
                  options: orderedOptions(
                    q,
                    slide.data.shuffleAnswers,
                    state.submitted ? Math.max(0, attempt - 1) : attempt,
                  ),
                },
                i,
              )}
            />
          )}
          <div className="quiz-options">
            {orderedOptions(
              q,
              slide.data.shuffleAnswers,
              state.submitted ? Math.max(0, attempt - 1) : attempt,
            ).map((o) => (
              <label key={o.id}>
                <input
                  type="radio"
                  name={slide.id + "-" + q.id}
                  checked={state.answers[q.id] === o.id}
                  disabled={!rt || state.submitted}
                  onChange={() =>
                    rt?.act({
                      type: "answer",
                      id: slide.id,
                      questionId: q.id,
                      optionId: o.id,
                    })
                  }
                />
                <ChoicePicture assetId={o.imageAssetId} />
                <span>{o.text}</span>
              </label>
            ))}
          </div>
          {showReview && (
            <div className="feedback">
              <strong>
                {state.answers[q.id] === q.options[q.correctAnswerIndex]?.id
                  ? "✓ Đúng"
                  : "! Chưa đúng hoặc chưa trả lời"}
              </strong>
              <p>
                Đáp án đúng:{" "}
                {q.options[q.correctAnswerIndex]?.text ??
                  "Cần kiểm tra lại câu hỏi"}
              </p>
              <p>{q.explanation}</p>
            </div>
          )}
        </fieldset>
      ))}
      {!slide.data.questions.length && (
        <p>Chưa có câu hỏi. Kết quả không được tính là đạt.</p>
      )}
      {result && (
        <p className="quiz-result" role="status">
          {result.score} / 100 — {result.passed ? "ĐẠT" : "CHƯA ĐẠT"}
        </p>
      )}
      {!state.submitted && (
        <button
          disabled={!rt}
          className="primary"
          onClick={() => {
            rt?.act({ type: "submit", id: slide.id });
            if (rt && slide.data.questions.length)
              celebrate(
                calculateQuizScore(slide.data, state.answers).passed
                  ? "right"
                  : "retry",
              );
          }}
        >
          Nộp bài & chấm điểm
        </button>
      )}
      {rt && canRetry(slide.data, state, rt.project.settings.allowRetry) && (
        <button onClick={() => rt.act({ type: "quizRetry", id: slide.id })}>
          Làm lại bài trắc nghiệm
        </button>
      )}
    </div>
  );
}
const stateLabels = {
  IN_PROGRESS: "Đang học",
  COMPLETED: "Đã hoàn thành",
  PASSED: "Đạt yêu cầu",
  FAILED: "Chưa đạt yêu cầu",
};
export function CompletionRenderer({ slide }: { slide: Slide }) {
  const rt = useLessonSession();
  const [certificateOpen, setCertificateOpen] = useState(false);
  if (slide.type !== "completion") return null;
  const certificate = rt ? certificateStatus(rt.project, rt.session) : null;
  const result = rt ? aggregateQuiz(rt.project, rt.session) : null;
  const completion = rt
    ? deriveCompletionState(rt.project, rt.session)
    : "IN_PROGRESS";
  const retryAvailable = rt?.project.slides.some(
    (s) =>
      s.type === "quiz" &&
      canRetry(
        s.data,
        rt.session.quizAttempts[s.id] ?? emptyQuiz(),
        rt.project.settings.allowRetry,
      ),
  );
  return (
    <div className="completion-view">
      <div className="completion-mark">✓</div>
      <h2>{stateLabels[completion]}</h2>
      <p>{slide.data.message}</p>
      {result?.hasQuiz && (
        <p>
          Kết quả kiểm tra: {result.score} / 100 · Ngưỡng đạt{" "}
          {rt?.project.settings.passingScore}%
        </p>
      )}
      {completion === "IN_PROGRESS" && (
        <p>Hãy xem đủ trang và hoàn tất các bài kiểm tra được yêu cầu.</p>
      )}
      <div className="completion-actions">
        <button disabled={!rt} onClick={() => rt?.review()}>
          {slide.data.reviewLabel}
        </button>
        {retryAvailable && (
          <button onClick={() => rt?.retry()}>{slide.data.retryLabel}</button>
        )}
        <button
          disabled={!certificate?.eligible}
          onClick={() => setCertificateOpen(true)}
        >
          Nhận giấy chứng nhận
        </button>
      </div>
      {certificate && !certificate.eligible && (
        <p className="hint">{certificate.reason}</p>
      )}
      {rt && certificate?.eligible && certificateOpen && (
        <CertificateDialog
          project={rt.project}
          score={certificate.score}
          hasQuiz={certificate.hasQuiz}
          defaultName={rt.studentName ?? ""}
          onClose={() => setCertificateOpen(false)}
        />
      )}
    </div>
  );
}
