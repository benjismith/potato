/** The SDK's own version, kept in sync with package.json. */
export const SDK_VERSION = "0.1.0";

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
