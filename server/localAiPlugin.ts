import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { z } from "zod";
import { documentBlockSchema, semanticCategories } from "../src/import/model";
import { projectSchema } from "../src/model/schema";
import { enhanceWithOpenAi } from "./enhancement";
import { designLesson, drawIllustration, studioStatus } from "./studio";
import {
  analyzeWithOpenAi,
  connectionStatus,
  type LocalAiConfig,
} from "./openai";

const inputSchema = z.object({
  version: z.literal("1.0"),
  documentId: z.string().min(1),
  sourceType: z.enum(["PASTE", "TXT", "DOCX", "PDF"]),
  blocks: z.array(documentBlockSchema).min(1).max(10000),
  structuralHints: z.array(
    z.object({
      blockId: z.string(),
      row: z.number().optional(),
      column: z.number().optional(),
      category: z.enum(semanticCategories),
      isHeading: z.boolean(),
    }),
  ),
});
export function localAiMiddleware(config: LocalAiConfig) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (!req.url?.startsWith("/api/lesson-ai/")) return next();
    const send = (status: number, value: unknown) => {
      if (res.destroyed) return;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(value));
    };
    // Local personal-use endpoint. Reject cross-origin callers and remote bindings.
    const host = req.headers.host ?? "";
    const origin = req.headers.origin;
    const remote = req.socket.remoteAddress;
    if (
      !remote ||
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote) ||
      !/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host) ||
      (origin && origin !== `http://${host}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      send(403, { error: "AI_LOCAL_ONLY" });
      return;
    }
    if (req.url === "/api/lesson-ai/status" && req.method === "GET") {
      send(200, connectionStatus(config));
      return;
    }
    if (req.url === "/api/lesson-ai/studio/status" && req.method === "GET") {
      send(200, studioStatus(config));
      return;
    }
    const enhancing = req.url === "/api/lesson-ai/enhance";
    const studio =
      req.url === "/api/lesson-ai/studio/design"
        ? designLesson
        : req.url === "/api/lesson-ai/studio/illustrate"
          ? drawIllustration
          : undefined;
    if (
      (!enhancing && !studio && req.url !== "/api/lesson-ai/analyze") ||
      req.method !== "POST"
    ) {
      send(404, { error: "AI_ROUTE" });
      return;
    }
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      send(415, { error: "AI_INPUT" });
      return;
    }
    const controller = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", cancel);
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        // The lesson design request sends page pictures along with the text.
        if (size > (studio === designLesson ? 40_000_000 : 2_000_000)) {
          send(413, { error: "AI_INPUT_TOO_LARGE" });
          return;
        }
        chunks.push(bytes);
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (studio) {
        try {
          send(200, await studio(config, body, controller.signal));
        } catch (error) {
          // Only our own error codes reach the browser, never provider text.
          const code =
            error instanceof Error && /^AI_[A-Z_]+$/.test(error.message)
              ? error.message
              : "AI_UNAVAILABLE";
          send(code === "AI_INPUT" ? 400 : 502, { error: code });
        }
        return;
      }
      if (enhancing) {
        const project = projectSchema.safeParse(body);
        if (!project.success) {
          send(400, { error: "AI_INPUT" });
          return;
        }
        send(
          200,
          await enhanceWithOpenAi(config, project.data, controller.signal),
        );
        return;
      }
      const parsed = inputSchema.safeParse(body);
      if (!parsed.success) {
        send(400, { error: "AI_INPUT" });
        return;
      }
      const result = await analyzeWithOpenAi(
        config,
        {
          ...parsed.data,
          structuralHints: parsed.data.structuralHints.map((h) => ({
            ...h,
            row: h.row,
            column: h.column,
          })),
          instructions: "",
          extractionWarnings: [],
        },
        controller.signal,
      );
      send(200, result);
    } catch {
      // Never reflect SDK/network/provider errors or credentials into the browser/logs.
      send(502, { error: "AI_UNAVAILABLE" });
    } finally {
      res.off("close", cancel);
    }
  };
}
export function localAiPlugin(config: LocalAiConfig): Plugin {
  return {
    name: "local-lesson-ai",
    configureServer(server) {
      server.middlewares.use(localAiMiddleware(config));
    },
  };
}
