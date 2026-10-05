import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb, pingDb } from "./db/client.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const { db, pool } = createDb(env.databaseUrl);
const app = createApp({ pingDb: () => pingDb(db) });

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`potato-api listening on http://localhost:${info.port}`);
});

function shutdown() {
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
