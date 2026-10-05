# Management API contract (`/v1`)

This is the contract between `potato-api` (the implementer) and `potato-ui`
(the consumer) for the dashboard's management API. Both sides build against
this document, so they can be developed in parallel. If an implementation
needs to deviate, update this doc in the same commit.

The SDK API (`/sdk/v1/…`) is specified separately in [SIGNING.md](SIGNING.md)
and [DATA-MODEL.md](DATA-MODEL.md#evaluation-v1).

## Conventions

- **Auth:** every `/v1` request runs as the stubbed current user (see
  DATA-MODEL.md). There are no auth headers in v1.
- **JSON:** request and response bodies are JSON with `camelCase` keys.
  Timestamps are ISO-8601 UTC strings (`"2026-10-05T13:45:00.000Z"`), or
  `null`.
- **Envelopes:** responses wrap their payload in a named key (`{ "flag": … }`,
  `{ "flags": [ … ] }`), so fields can be added later without breaking clients.
- **Status codes:** `200` for reads and updates, `201` for creates, and `204`
  for deletes with no body.
- **Tenancy:** a resource in an org the current user doesn't belong to is
  reported as `404`, exactly like a nonexistent one.
- **In the UI:** the dev server proxies `/api/*` to the API with the `/api`
  prefix stripped, so the UI calls `/api/v1/…`.

### Errors

Every error response has this body:

```json
{ "error": "validation_failed", "message": "Human-readable explanation", "details": { } }
```

| Status | `error`             | When |
|--------|---------------------|------|
| 400    | `validation_failed` | The body or params failed validation. `details` describes the failing fields. |
| 401    | `unauthorized`      | The configured current user doesn't exist. |
| 404    | `not_found`         | The resource doesn't exist, or isn't visible to the current user. |
| 409    | `conflict`          | A uniqueness violation (duplicate slug or flag key). |
| 409    | `version_conflict`  | A stale `version` on a flag-config write. `details` is `{ "currentVersion": n }`. |

## Resource shapes

```ts
type User = { id: string; email: string; name: string };

type Org = { id: string; slug: string; name: string; role: "owner" | "admin" | "member" };

type App = { id: string; orgId: string; slug: string; name: string; createdAt: string; updatedAt: string };

type Environment = { id: string; applicationId: string; slug: string; name: string; createdAt: string; updatedAt: string };

type FlagType = "boolean" | "string" | "number" | "json";

type Variation = { id: string; name: string; value: unknown; sortOrder: number };

type FlagConfig = {
  environmentId: string;
  enabled: boolean;
  offVariationId: string;
  defaultVariationId: string;
  version: number;
  updatedAt: string;
  updatedBy: string;       // user ID
};

type Target = { subjectKey: string; variationId: string; createdAt: string };

type Flag = {
  id: string;
  applicationId: string;
  key: string;
  name: string;
  description: string | null;
  type: FlagType;
  variations: Variation[];                    // sorted by sortOrder
  configs: Record<string, FlagConfig>;        // keyed by environment ID, one per environment
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type FlagDetail = Flag & {
  configs: Record<string, FlagConfig & { targets: Target[] }>;
};

type SigningKey = {
  id: string;              // key_…
  environmentId: string;
  label: string;
  algorithm: "ed25519";
  fingerprint: string;     // first 16 hex chars of SHA-256(raw 32-byte public key)
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
```

## Endpoints

### Current user and tenancy (task 000005)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET  | `/v1/me` | | `{ user: User, orgs: Org[] }` |
| GET  | `/v1/orgs/:orgId/apps` | | `{ apps: App[] }` |
| POST | `/v1/orgs/:orgId/apps` | `{ slug, name }` | `201 { app: App, environments: Environment[] }`. Creates `development` and `production` environments. |
| GET  | `/v1/apps/:appId` | | `{ app: App }` |
| GET  | `/v1/apps/:appId/environments` | | `{ environments: Environment[] }`, ordered by creation |
| POST | `/v1/apps/:appId/environments` | `{ slug, name }` | `201 { environment: Environment }` |

### Flags (task 000006)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET   | `/v1/apps/:appId/flags` | | `{ flags: Flag[] }`. Excludes archived flags unless `?archived=true`. Ordered by `key`. |
| POST  | `/v1/apps/:appId/flags` | `{ key, name, description?, type, variations? }` | `201 { flag: FlagDetail }` |
| GET   | `/v1/flags/:flagId` | | `{ flag: FlagDetail }` |
| PATCH | `/v1/flags/:flagId` | `{ name?, description? }` | `{ flag: FlagDetail }` |
| POST  | `/v1/flags/:flagId/archive` | | `{ flag: FlagDetail }` (idempotent) |
| POST  | `/v1/flags/:flagId/unarchive` | | `{ flag: FlagDetail }` (idempotent) |
| PATCH | `/v1/flags/:flagId/environments/:envId` | `{ version, enabled?, offVariationId?, defaultVariationId? }` | `{ config: FlagConfig & { targets: Target[] } }` |
| PUT   | `/v1/flags/:flagId/environments/:envId/targets/:subjectKey` | `{ version, variationId }` | `{ config: FlagConfig & { targets: Target[] } }` |
| DELETE | `/v1/flags/:flagId/environments/:envId/targets/:subjectKey?version=N` | | `{ config: FlagConfig & { targets: Target[] } }` |

Notes:

- **Creating flags:**
  - For `type: "boolean"`, omit `variations`. The API creates `{ name: "On", value: true }` and `{ name: "Off", value: false }`.
  - Every other type requires `variations: [{ name, value }, …]` with at least two entries, each value matching the type.
  - New configs start disabled, with the off variation set to the last variation and the default set to the first. For booleans that means off → `false` and default → `true`.
- **Versions:** every config write (including target writes) must send the `version` it last read, and gets back the config with its new `version`. A stale version gets `409 version_conflict`.
- **Variation IDs** in config and target writes must belong to the same flag (`400` otherwise).
- **Subject keys** in target paths are URL-encoded and must be 1–255 characters.
- **Deleting:** flags are archived, never deleted, in v1.

### Signing keys (task 000007)

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET  | `/v1/environments/:envId/keys` | | `{ keys: SigningKey[] }`, newest first |
| POST | `/v1/environments/:envId/keys` | `{ label, publicKeyPem }` | `201 { key: SigningKey }` |
| POST | `/v1/keys/:keyId/revoke` | | `{ key: SigningKey }` (idempotent) |
