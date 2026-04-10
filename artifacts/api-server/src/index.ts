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

await runStartupMigrations();
logger.info("Database schema ready");

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
