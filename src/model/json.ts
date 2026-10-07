import { parseProject, type LessonProject } from "./schema";
import { decodeProject } from "./migrations";
// The edited canonical project is the sole export source; never rebuild from source/AI.
export function exportProjectJSON(project: LessonProject) {
  return JSON.stringify(parseProject(project), null, 2);
}
export function importProjectJSON(text: string) {
  return decodeProject(JSON.parse(text));
}
export function downloadProjectJSON(project: LessonProject) {
  const blob = new Blob([exportProjectJSON(project)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    (project.metadata.projectTitle.replace(/[<>:"/\\|?*]/g, "_") ||
      "Bai-giang") + ".json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
