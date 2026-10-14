// Starts the hosted app: `npm run build && npm run build:server`, then
// `npm start`. Settings come from environment variables (see docs/TRIEN_KHAI.md);
// secrets are never printed.
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createWebHandler, type WebConfig } from "./app";
import { Store } from "./store";

const env = process.env;
const required = (name: string) => {
  const v = env[name]?.trim();
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
};

const publicUrl = required("PUBLIC_URL").replace(/\/+$/, "");
const dataDir = resolve(env.DATA_DIR ?? "data");
mkdirSync(dataDir, { recursive: true });
const config: WebConfig = {
  publicUrl,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }
      : null,
  ai: {
    provider: env.LESSON_AI_PROVIDER,
    model: env.LESSON_AI_MODEL,
    apiKey: env.LESSON_AI_API_KEY,
    thinking: env.LESSON_AI_THINKING,
  },
  freeCredits: Number(env.FREE_CREDITS ?? 3),
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  staticDir: resolve(env.STATIC_DIR ?? "dist"),
  payos:
    env.PAYOS_CLIENT_ID && env.PAYOS_API_KEY && env.PAYOS_CHECKSUM_KEY
      ? {
          clientId: env.PAYOS_CLIENT_ID,
          apiKey: env.PAYOS_API_KEY,
          checksumKey: env.PAYOS_CHECKSUM_KEY,
        }
      : null,
  appsDir: env.APPS_DIR ? resolve(env.APPS_DIR) : undefined,
  ttsKey: env.GOOGLE_TTS_API_KEY?.trim() || undefined,
};
const store = new Store(join(dataDir, "app.db"));
const handler = createWebHandler(config, { store });
const port = Number(env.PORT ?? 8080);
createServer((req, res) => void handler(req, res)).listen(port, () => {
  console.info(
    `Ứng dụng soạn bài đang chạy ở cổng ${port} (${publicUrl}). Đăng nhập Google: ${
      config.google ? "bật" : "chưa cấu hình"
    }. AI: ${config.ai.apiKey ? "đã có khoá" : "chưa có khoá"}. Thanh toán PayOS: ${
      config.payos ? "bật" : "chưa cấu hình"
    }. Ứng dụng học sinh: ${config.appsDir ?? "chưa cấu hình"}. Giọng đọc Google: ${
      config.ttsKey ? "bật" : "dùng giọng trình duyệt"
    }.`,
  );
});
