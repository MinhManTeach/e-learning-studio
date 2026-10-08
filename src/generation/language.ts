// Conservative rewriting preserves the source assertion. No subject-specific facts
// are introduced; uncertain or dense assertions remain visible for teacher review.
export function learnerText(text: string) {
  return text
    .trim()
    .replace(/^[-•\s]+/, "")
    .replace(
      /^(?:giáo viên|GV)\s+(?:tổ chức|hướng dẫn|yêu cầu|cho)\s*(?:cho\s*)?(?:học sinh|HS)\s*/iu,
      "Em hãy ",
    )
    .replace(/^(?:học sinh|HS)\s+(?:có thể\s*)?/iu, "Em ")
    .replace(/\bhọc sinh\b/giu, "em")
    .replace(/^(?:sau bài học[,\s]*|yêu cầu cần đạt[:\s]*)/iu, "")
    .replace(/^em hãy\s*(?:hãy\s*)?/iu, "Em hãy ");
}
export function learnerGoal(text: string) {
  const clean = learnerText(text).replace(/^em\s+(?:hãy\s+)?/iu, "");
  return clean ? clean[0].toLocaleUpperCase("vi") + clean.slice(1) : "";
}
export function shortPoints(lines: string[]) {
  const seen = new Set<string>();
  return lines.map(learnerText).filter((line) => {
    const key = line
      .toLocaleLowerCase("vi")
      .replace(/[.!?:;…]+$/u, "")
      .replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function narration(
  title: string,
  points: string[],
  interactive: boolean,
) {
  const focus = points[0]?.replace(/[.!?]+$/, "") || title;
  return interactive
    ? `Ở hoạt động này, em có thời gian suy nghĩ trước khi chọn. Hãy dựa vào ý: ${focus}. Sau khi chọn, đọc phản hồi để giải thích cách làm của mình.`
    : `Chúng mình cùng tìm hiểu ${title.toLocaleLowerCase("vi")}. Hãy chú ý đến ý chính: ${focus}. Em có thể dừng lại, đọc từng ý và liên hệ với một ví dụ em đã gặp.`;
}
