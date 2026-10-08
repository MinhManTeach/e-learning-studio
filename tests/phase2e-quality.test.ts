import { describe, expect, it } from "vitest";
import { createProject, createSlide } from "../src/model/factories";
import {
  analyzeLessonQuality,
  recommendLayout,
  proposeImprovements,
  applyProposal,
} from "../src/quality/analyzer";
import { editorReducer, editorState } from "../src/editor/reducer";
import { learnerText, shortPoints } from "../src/generation/language";
import { IDBFactory } from "fake-indexeddb";
import { openIndexedStore } from "../src/storage/projects";
import { calculateQuizScore } from "../src/player/session";

describe("Phase 2E quality and safe proposals", () => {
  it("rechecks the slide cap when applying an older splitting proposal", () => {
    const p = createProject();
    p.slides = Array.from({ length: 29 }, () => createSlide("content"));
    for (const s of p.slides.slice(0, 2))
      if (s.type === "content") {
        s.estimatedMinutes = 3;
        s.data.body = "Nội dung nguồn ".repeat(80);
        s.data.bulletPoints = ["Một ý tiếp theo"];
      }
    const proposals = proposeImprovements(p).filter((x) => x.kind === "SPLIT");
    const first = applyProposal(p, proposals[0]);
    expect(first.slides).toHaveLength(30);
    expect(() => applyProposal(first, proposals[1])).toThrow(/30/);
  });
  it("uses answer count in recommendations and detects a missing approved principle code", () => {
    const p = createProject(),
      s = createSlide("scenario");
    p.slides = [s];
    s.data.situation = "Em kiểm tra thông tin";
    s.data.choices = s.data.choices.slice(0, 2);
    expect(recommendLayout(s, true).layout).toBe("TEXT_LEFT_MEDIA_RIGHT");
    s.data.choices.push({ ...s.data.choices[0], id: "third" });
    expect(recommendLayout(s, true).layout).toBe("TEXT_ONLY");
    expect(
      analyzeLessonQuality(p, {
        outcomes: [],
        bySlide: { [s.id]: ["5.A1.1 Em kiểm tra thông tin"] },
      }).issues.some((i) => i.issueCode === "SOURCE_PRINCIPLE_MISSING"),
    ).toBe(true);
  });
  it("retains assertions and responsible AI codes while removing administrative lead-ins", () => {
    expect(learnerText("GV yêu cầu HS kiểm tra thông tin theo 5.A1.1.")).toBe(
      "Em hãy kiểm tra thông tin theo 5.A1.1.",
    );
    expect(
      shortPoints(["Tìm thông tin.", "Tìm thông tin", "Kiểm tra nguồn"]),
    ).toEqual(["Tìm thông tin.", "Kiểm tra nguồn"]);
  });
  it("round-trips approved edits and undo through IndexedDB without changing quiz scoring", async () => {
    const p = createProject();
    const objective = createSlide("objectives");
    objective.title = "Mục tiêu do giáo viên đặt";
    p.slides = [objective, createSlide("quiz")];
    const quiz = p.slides[1];
    if (quiz.type !== "quiz") throw new Error("fixture");
    const score = calculateQuizScore(quiz.data, {});
    const proposal = proposeImprovements(p).find(
      (x) => x.kind === "OBJECTIVES",
    )!;
    const changed = editorReducer(editorState(p), {
      type: "quality",
      proposal,
    });
    const store = await openIndexedStore(new IDBFactory(), "phase2e-roundtrip");
    await store.save(changed.project);
    expect((await store.list()).projects[0]).toEqual(changed.project);
    expect(changed.project.slides[1]).toEqual(quiz);
    expect(calculateQuizScore(quiz.data, {})).toEqual(score);
    expect(editorReducer(changed, { type: "quality-undo" }).project).toEqual(p);
    const manual = editorReducer(changed, {
      type: "edit",
      slide: {
        ...changed.project.slides[0],
        subtitle: "Giáo viên sửa sau khi áp dụng",
      },
    });
    expect(editorReducer(manual, { type: "quality-undo" }).project).toEqual(
      manual.project,
    );
  });
  it("reports structured density, repetition and source uncertainty without scores", () => {
    const p = createProject();
    const s = createSlide("content");
    s.data.body = "Thông tin cần kiểm tra. ".repeat(60);
    p.slides = [s, { ...structuredClone(s), id: "copy" }];
    const report = analyzeLessonQuality(p);
    expect(
      report.issues.some(
        (i) => i.issueCode === "TEXT_DENSITY" && i.slideId === s.id,
      ),
    ).toBe(true);
    expect(report.issues.some((i) => i.issueCode === "REPEATED_CONTENT")).toBe(
      true,
    );
    expect(
      report.issues.some((i) => i.issueCode === "SOURCE_UNAVAILABLE"),
    ).toBe(true);
    expect(report).not.toHaveProperty("score");
    expect(report.issues[0]).toHaveProperty("suggestedAction");
  });
  it("checks approved source coverage and flags unsupported assertions for review", () => {
    const p = createProject();
    p.slides = [createSlide("content")];
    const report = analyzeLessonQuality(p, {
      outcomes: ["5.A1.1 Con người chịu trách nhiệm"],
      bySlide: { [p.slides[0].id]: ["Kiểm tra thông tin"] },
    });
    expect(report.issues.some((i) => i.issueCode === "OUTCOME_COVERAGE")).toBe(
      true,
    );
    expect(report.issues.some((i) => i.issueCode === "SOURCE_REVIEW")).toBe(
      true,
    );
  });
  it("deduplicates objectives only through approval and protects stale manual edits", () => {
    const p = createProject();
    const s = createSlide("objectives");
    s.data.learningOutcomes = ["Nhận biết thông tin", "Nhận biết thông tin"];
    p.slides = [s];
    const proposal = proposeImprovements(p).find(
      (x) => x.kind === "OBJECTIVES",
    )!;
    expect(p.slides[0]).toEqual(s);
    const improved = applyProposal(p, proposal);
    expect(improved.slides[0].title).toBe("Hôm nay em sẽ…");
    expect(
      improved.slides[0].type === "objectives" &&
        improved.slides[0].data.learningOutcomes,
    ).toEqual(["Nhận biết thông tin"]);
    p.slides[0].title = "Giáo viên vừa sửa";
    expect(() => applyProposal(p, proposal)).toThrow(/thay đổi/);
  });
  it("splits content without inventing facts, losing assets or increasing time", () => {
    const p = createProject();
    const s = createSlide("content");
    s.estimatedMinutes = 4;
    s.data.body = "Ý nguồn thứ nhất ".repeat(40);
    s.data.bulletPoints = [
      "Ý nguồn thứ hai ".repeat(35),
      "5.A1.1 Con người chịu trách nhiệm",
    ];
    s.media = {
      ...s.media,
      enabled: true,
      assetId: "image",
      caption: "Author CC BY",
    };
    p.assets = [
      {
        id: "image",
        kind: "IMAGE",
        sourceType: "UPLOAD",
        name: "Photo",
        fileName: "photo.png",
        mimeType: "image/png",
        url: "local-media:image",
        altText: "Ảnh minh họa",
        status: "LOCAL",
      },
    ];
    p.slides = [s];
    const proposal = proposeImprovements(p).find((x) => x.kind === "SPLIT")!;
    const result = applyProposal(p, proposal);
    expect(result.slides).toHaveLength(2);
    expect(
      result.slides.reduce((n, s) => n + (s.estimatedMinutes ?? 0), 0),
    ).toBe(4);
    expect(result.slides[0].media).toEqual(s.media);
    expect(result.assets).toEqual(p.assets);
    expect(result.projectId).toBe(p.projectId);
    expect(JSON.stringify(result)).toContain("5.A1.1");
  });
  it("never splits quiz or scenario assessment data and recommends rather than overrides layout", () => {
    const p = createProject();
    const s = createSlide("quiz");
    p.slides = [s];
    expect(proposeImprovements(p).some((x) => x.kind === "SPLIT")).toBe(false);
    expect(recommendLayout(s, true).layout).toBe("TEXT_ONLY");
    const content = createSlide("content");
    content.layout = "MEDIA_LEFT_TEXT_RIGHT";
    expect(recommendLayout(content, true).layout).toBe("TEXT_LEFT_MEDIA_RIGHT");
    expect(content.layout).toBe("MEDIA_LEFT_TEXT_RIGHT");
  });
  it("flags missing feedback, alt text, time and practice-before-example", () => {
    const p = createProject();
    const s = createSlide("scenario");
    s.pedagogicalStage = "PRACTICE";
    s.estimatedMinutes = 100;
    s.data.choices.forEach((c) => (c.feedback = ""));
    s.media.enabled = true;
    s.media.assetId = "missing";
    p.slides = [s];
    const codes = analyzeLessonQuality(p).issues.map((i) => i.issueCode);
    expect(codes).toEqual(
      expect.arrayContaining([
        "FEEDBACK",
        "MEDIA_REFERENCE",
        "TIME_BUDGET",
        "ACTIVITY_SEQUENCE",
      ]),
    );
  });
});
