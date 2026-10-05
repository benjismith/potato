import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "../src/index.js";

describe("potato-sdk", () => {
  it("exports its version", () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
