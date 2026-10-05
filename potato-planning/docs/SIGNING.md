# Request signing (SDK API)

Every request to the SDK API (`/sdk/v1/…`) must be signed with an Ed25519
private key whose public key is registered in Potato. Unsigned or invalid
requests are refused with `401`. This document is the normative spec: the
`potato-api` verifier and the `potato-sdk` signer must both follow it exactly,
and both must pass the shared [test vectors](signing-vectors.json).

## Keys

- **Algorithm:** Ed25519 (RFC 8032). Signing is deterministic, which is what
  makes fixed test vectors possible.
- **Private key:** held only by the customer's server, as a PKCS#8 PEM. Potato
  never sees it.
- **Public key:** registered with Potato as an SPKI PEM, scoped to one
  **environment**. The registered key gets an ID (`key_<ULID>`), which the
  client sends with each request.
- Keys can be made with OpenSSL, Node, the browser, or the dashboard:

  ```sh
  openssl genpkey -algorithm ed25519 -out potato-private.pem
  openssl pkey -in potato-private.pem -pubout -out potato-public.pem
  ```

The key ID determines the environment, and therefore the application and org.
A request can only ever read flags belonging to the key's own environment.

## Request headers

| Header               | Format | Example |
|----------------------|--------|---------|
| `X-Potato-Key-Id`    | `key_` + 26-char ULID, uppercase Crockford Base32: `^key_[0-9A-HJKMNP-TV-Z]{26}$` | `key_01JZZTESTKEY00000000000000` |
| `X-Potato-Timestamp` | Unix time in **seconds**, base-10 integer with no sign and no leading zeros: `^(0\|[1-9][0-9]*)$` | `1767225600` |
| `X-Potato-Nonce`     | 16–64 chars of `[A-Za-z0-9_-]`; generate from ≥ 16 random bytes, base64url-encoded | `bm9uY2UtMDAwMDAwMDAx` |
| `X-Potato-Signature` | Base64url (RFC 4648 §5), **no padding**, of the 64-byte signature | `DYzV8-YB4P4w…` (86 chars) |

## Canonical string

The signature is computed over the UTF-8 bytes of these seven fields, joined
with a single `\n` (LF), with **no** trailing newline:

```
POTATO-ED25519-V1
<key id>
<HTTP method, uppercase>
<request target: path + "?" + query, exactly as sent>
<timestamp>
<nonce>
<lowercase hex SHA-256 of the raw request body bytes>
```

Rules:

- **Version tag:** the literal `POTATO-ED25519-V1`. Bumping it is how we'd
  change the scheme without ambiguity.
- **Request target:** the path and query string exactly as they appear on the
  HTTP request line (e.g. `/sdk/v1/evaluate` or `/sdk/v1/example?b=2&a=1`).
  Don't normalize, re-encode, or sort query parameters. Omit the `?` if there
  is no query. The host and scheme are **not** signed. **Proxies between the SDK
  and the API must not rewrite the path**, or signatures will fail.
- **Body hash:** hash the exact bytes sent. Don't re-serialize the JSON. An
  empty body hashes to `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- **Method:** signers MUST send standard uppercase methods (`GET`, `POST`,
  `PATCH`, …), and the canonical string uses the method uppercased. Note that
  `fetch` does not uppercase `patch`, so always pass uppercase. Verifiers
  uppercase the received method before building the canonical string.
- Header values are used verbatim (no trimming beyond what HTTP itself does).
- Signers and verifiers apply the same format regexes (above). A verifier
  rejects any header that fails them with `missing_or_malformed_headers`
  before doing anything else.

## Verification (API)

The API verifies in this order, and fails with `401` at the first failing step:

| # | Check | `reason` on failure |
|---|-------|---------------------|
| 1 | All four headers present and well-formed. | `missing_or_malformed_headers` |
| 2 | `abs(now − timestamp) ≤ 300` seconds. | `stale_timestamp` |
| 3 | Key ID exists and is not revoked. | `unknown_key` |
| 4 | Signature verifies over the canonical string, built from the request as received. | `bad_signature` |
| 5 | `(key id, nonce)` has not been seen within the last 600 seconds. | `replayed_nonce` |

On success, the nonce is recorded (only **after** step 4, so unauthenticated
traffic can't fill the nonce store), `last_used_at` is updated (at most once a
minute per key), and the resolved environment is attached to the request
context for the route handler.

Failure response:

```json
{ "error": "unauthorized", "reason": "stale_timestamp" }
```

`reason` is intended for the customer's debugging. Unknown and revoked keys
deliberately share `unknown_key`, so a caller can't distinguish them.

Other limits:

- The request body is capped at **64 KiB** (`413` beyond that). The verifier
  reads the raw bytes once, hashes them, and hands the same bytes to the
  handler.
- The nonce window (600 s) is longer than the timestamp window (±300 s), so
  any request that passes step 2 can't be replayed after its nonce expires.
- **v1 nonce store:** in-memory with TTL eviction. That's correct for a
  single API process. Running several instances requires a shared store (a
  MySQL table or Redis); this is a known follow-up.

## Signing (SDK)

```
nonce      = base64url(randomBytes(16))
timestamp  = floor(Date.now() / 1000)
bodyHash   = hex(sha256(bodyBytes))
canonical  = join("\n", ["POTATO-ED25519-V1", keyId, METHOD, target, timestamp, nonce, bodyHash])
signature  = base64url(ed25519.sign(privateKey, utf8(canonical)))
```

The SDK must sign the **exact body bytes it sends**: serialize once, sign
those bytes, and send those same bytes. It generates a fresh nonce for every
request, including retries.

## Test vectors

[`signing-vectors.json`](signing-vectors.json) contains a fixed **test-only**
keypair (seed bytes `0x00…0x1f`, which must never be used outside tests) and
several cases. For each case, it gives the request fields, the expected body
hash, the expected canonical string, and the expected signature.

Both projects' test suites must load this file (by relative path from the
monorepo root) and check that:

1. Building the canonical string from the case's fields reproduces `canonical`
   exactly.
2. **SDK:** signing `canonical` with `privateKeyPem` reproduces `signature`
   exactly.
3. **API:** `signature` verifies against `publicKeyPem`, and fails to verify
   if any single field (method, target, timestamp, nonce, or a single body
   byte) is altered.

The vectors' timestamps are fixed in the past, so verifier tests must inject a
clock rather than using the real time.

If the scheme ever changes, regenerate the vectors and bump the version tag.
