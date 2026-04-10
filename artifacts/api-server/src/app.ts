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

// Trust the first proxy so Railway's TLS termination is respected.
// Without this, express-session's secure cookies are never set because
// req.secure is false behind the proxy even though the connection is HTTPS.
app.set("trust proxy", 1);

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
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
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
  },
}));

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
