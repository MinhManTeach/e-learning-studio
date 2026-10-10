// Entry point of the player bundled into exported SCORM / HTML5 packages.
// Built separately as one classic (IIFE) script so it also runs from file://.
import { createRoot } from "react-dom/client";
import "../styles.css";
import "../lesson-themes.css";
import "../kids-theme.css";
import "../player/player.css";
import { LessonPlayer } from "../player/LessonPlayer";
import { connectLms } from "../player/lms";
import {
  ImageResolverContext,
  packagedImageResolver,
} from "../media/imageResolver";
import { playerDataGlobal, readPlayerData } from "./playerData";

const root = createRoot(document.getElementById("root")!);
try {
  const data = readPlayerData(
    (window as unknown as Record<string, unknown>)[playerDataGlobal],
  );
  document.title = data.project.metadata.projectTitle || document.title;
  root.render(
    <ImageResolverContext.Provider
      value={packagedImageResolver(data.files, document.baseURI)}
    >
      <LessonPlayer
        project={data.project}
        lms={connectLms(window, data.project.projectId)}
      />
    </ImageResolverContext.Provider>,
  );
} catch {
  root.render(
    <main className="startup">
      <h1>Không mở được bài giảng</h1>
      <p>
        Gói bài giảng bị thiếu hoặc hỏng tệp. Hãy giải nén lại toàn bộ tệp ZIP,
        hoặc nhờ thầy cô xuất lại gói.
      </p>
    </main>,
  );
}
