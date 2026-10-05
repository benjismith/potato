export interface Env {
  port: number;
  databaseUrl: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (see .env.example)");
  }
  const port = Number(source.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${source.PORT}"`);
  }
  return { port, databaseUrl };
}
