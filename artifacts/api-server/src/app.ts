import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const PgStore = connectPgSimple(session);

const app: Express = express();

// Trust all proxies — required for Cloudflare + Replit layered proxies.
// This ensures req.secure is true behind TLS-terminating proxies (Cloudflare,
// Railway, Replit) and that X-Forwarded-For / CF-Connecting-IP are respected.
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: IncomingMessage & { id?: unknown }) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: ServerResponse) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin: (origin, callback) => callback(null, true),
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === "production") {
  throw new Error(
    "SESSION_SECRET environment variable must be set in production.",
  );
}

app.use(session({
  store: new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: "session",
    createTableIfMissing: true,
  }),
  secret: sessionSecret || "cortex-ai-secret-dev-key-2024",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    // "lax" works correctly behind Cloudflare — allows cookies on top-level
    // navigations (links) while still blocking cross-site POST forgery.
    sameSite: "lax",
  },
}));

// Cloudflare sets CF-Connecting-IP; expose it via req.headers so downstream
// code can read the real visitor IP regardless of the proxy chain.
// req.ip is already correct because trust proxy is enabled above.

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "public");

  logger.info({ publicDir }, "Serving frontend static files");
  app.use(express.static(publicDir));

  // Explicit 404 for unmatched /api/* paths so they return JSON, not the SPA.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // SPA catch-all — Express 5 requires a named wildcard parameter.
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
