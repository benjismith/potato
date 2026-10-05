/** Returns TEST_DATABASE_URL, refusing to run against anything but a test DB. */
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set (see .env.example). Integration tests need a MySQL database such as potato_test.",
    );
  }
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith("_test")) {
    // Every test truncates all tables, so never point this at real data.
    throw new Error(
      `TEST_DATABASE_URL must name a database ending in "_test", got "${database}"`,
    );
  }
  return url;
}
