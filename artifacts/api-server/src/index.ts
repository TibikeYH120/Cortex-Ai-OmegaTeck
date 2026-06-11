import app from "./app";
import { logger } from "./lib/logger";
import { runStartupMigrations } from "./migrate";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Retry migration up to 5 times — Neon/serverless DBs can be asleep at cold start
const MAX_MIGRATION_ATTEMPTS = 5;
const MIGRATION_RETRY_DELAY_MS = 3000;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let migrationOk = false;
for (let attempt = 1; attempt <= MAX_MIGRATION_ATTEMPTS; attempt++) {
  try {
    await runStartupMigrations();
    logger.info("Database schema ready");
    migrationOk = true;
    break;
  } catch (err) {
    logger.warn(
      { err, attempt, maxAttempts: MAX_MIGRATION_ATTEMPTS },
      `Migration attempt ${attempt} failed — ${attempt < MAX_MIGRATION_ATTEMPTS ? `retrying in ${MIGRATION_RETRY_DELAY_MS / 1000}s…` : "giving up, starting server anyway"}`
    );
    if (attempt < MAX_MIGRATION_ATTEMPTS) {
      await sleep(MIGRATION_RETRY_DELAY_MS);
    }
  }
}

if (!migrationOk) {
  logger.warn(
    "All migration attempts failed. Server will start anyway — the schema may already be up to date."
  );
}

if (!process.env["TAVILY_API_KEY"]) {
  logger.warn(
    "TAVILY_API_KEY is not set — web search will fall back to Wikipedia only. " +
    "Get a free key (1,000 searches/month) at https://app.tavily.com"
  );
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
