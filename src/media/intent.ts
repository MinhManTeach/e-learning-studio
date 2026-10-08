import type { LessonProject, Slide } from "../model/schema";
export class MediaIntentAnalyzer {
  analyze(project: LessonProject, slide: Slide) {
    const index = project.slides.findIndex((s) => s.id === slide.id);
    const content = JSON.stringify(slide.data);
    const context = [
      slide.title,
      content,
      slide.media.suggestion,
      slide.teacherNotes,
    ].join(" ");
    const normalized = context.toLocaleLowerCase("vi");
    const neighbors = project.slides
      .slice(Math.max(0, index - 1), index + 2)
      .filter((s) => s.id !== slide.id)
      .map((s) => s.title);
    const grade = Number(
      project.metadata.targetAudienceGrade ||
        project.metadata.curriculumGrade ||
        project.metadata.grade,
    );
    const age = Number.isFinite(grade) && grade > 0 ? grade + 5 : null;
    const keywords = /^Từ khóa:[\t ]*([^\r\n]*)/im
      .exec(slide.media.suggestion)?.[1]
      ?.trim();
    const focus = slide.title.replace(/[?!]/g, "").trim();
    let english = focus;
    if (/\bai\b|trí tuệ nhân tạo|chatbot/i.test(normalized))
      english = /cá nhân|riêng tư|bảo vệ/.test(normalized)
        ? "artificial intelligence privacy education"
        : /trách nhiệm|kiểm tra|quyết định/.test(normalized)
          ? "responsible artificial intelligence human decision making education"
          : "artificial intelligence education illustration";
    else if (/tìm kiếm|thu thập|thông tin|internet|website/.test(normalized)) {
      english = /an toàn|cá nhân|bảo vệ/.test(normalized)
        ? "internet privacy online safety children illustration"
        : /phù hợp|đáng tin|chính xác|kiểm chứng/.test(normalized)
          ? "checking reliable online information digital literacy education"
          : /từ khóa|tìm kiếm/.test(normalized)
            ? "children computer search engine keywords education"
            : /thu thập|quan sát/.test(normalized)
              ? "students collecting information observation education"
              : "children reading website information digital literacy";
    } else if (/máy tính|bàn phím|chuột/.test(normalized))
      english = "computer keyboard mouse education";
    else
      english = [
        project.metadata.subject,
        focus,
        neighbors[0] ?? "",
        age && age < 12 ? "primary school education" : "education",
      ].join(" ");
    const stageContext =
      slide.pedagogicalStage === "PRACTICE"
        ? "tình huống thực hành"
        : slide.pedagogicalStage === "ASSESSMENT"
          ? "kiểm tra kiến thức"
          : "bài học";
    const learnerContext = age && age < 12 ? "học sinh tiểu học" : "học sinh";
    const queries = [
      keywords ||
        `${focus} ${project.metadata.topic || project.metadata.subject} ${learnerContext} ${stageContext}`,
      english,
    ].map((q) => q.replace(/\s+/g, " ").trim().slice(0, 300));
    return {
      slideId: slide.id,
      title: slide.title,
      content,
      pedagogicalPurpose: slide.teacherNotes,
      mediaIntent: slide.media.suggestion,
      stage: slide.pedagogicalStage,
      learnerAge: age,
      neighborTitles: neighbors,
      queries: [...new Set(queries)],
    };
  }
}
