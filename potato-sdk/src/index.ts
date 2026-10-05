export {
  SDK_VERSION,
  EVALUATE_PATH,
  DEFAULT_TIMEOUT_MS,
  createPotatoClient,
  PotatoError,
  PotatoFlags,
} from "./client.js";
export type { FlagValue, PotatoClient, PotatoClientErrorCode, PotatoClientOptions, Subject } from "./client.js";

export {
  SIGNING_VERSION,
  KEY_ID_HEADER,
  TIMESTAMP_HEADER,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  buildCanonicalString,
  generateNonce,
  hashBody,
  loadPrivateKey,
  signRequest,
} from "./signing.js";
export type { CanonicalFields, SignedHeaders, SignRequestOptions } from "./signing.js";
