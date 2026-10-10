import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { localAiPlugin } from "./server/localAiPlugin";
import { playerBundlePlugin } from "./server/playerBundlePlugin";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "LESSON_AI_");
  return {
    plugins: [
      react(),
      playerBundlePlugin(),
      localAiPlugin({
        provider: env.LESSON_AI_PROVIDER,
        model: env.LESSON_AI_MODEL,
        apiKey: env.LESSON_AI_API_KEY,
        imageModel: env.LESSON_AI_IMAGE_MODEL,
        thinking: env.LESSON_AI_THINKING,
      }),
    ],
  };
});
