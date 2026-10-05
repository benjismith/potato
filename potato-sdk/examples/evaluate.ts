// Demo: fetch the evaluated flags for one subject, the way a customer's server would.
//
//   npx tsx examples/evaluate.ts alice
//
// Config comes from the environment (or .env). Without POTATO_PRIVATE_KEY_PATH it
// falls back to the TEST-ONLY key in signing-vectors.json, which
// `npm run db:dev-key` (in potato-api) registers against the seed app.
import { readFileSync } from "node:fs";
import { createPotatoClient } from "../src/index.js";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env; use the real environment.
}

const vectors = JSON.parse(
  readFileSync(new URL("../../potato-planning/docs/signing-vectors.json", import.meta.url), "utf8"),
) as { keyId: string; privateKeyPem: string };

const potato = createPotatoClient({
  apiUrl: process.env.POTATO_API_URL ?? "http://localhost:3000",
  keyId: process.env.POTATO_KEY_ID ?? vectors.keyId,
  privateKey: process.env.POTATO_PRIVATE_KEY_PATH
    ? readFileSync(process.env.POTATO_PRIVATE_KEY_PATH, "utf8")
    : vectors.privateKeyPem,
});

const subjectKey = process.argv[2] ?? "alice";
const flags = await potato.evaluate({ key: subjectKey });
console.log(`Flags for subject "${subjectKey}":`);
console.log(JSON.stringify(flags.toJSON(), null, 2));
