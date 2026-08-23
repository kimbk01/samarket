import { describe, expect, it } from "vitest";
import {
  isCompositionPolicyStaleError,
  parseExpectedCompositionPolicyRevision,
} from "@/lib/stores/composition/stores-composition-policy-concurrency";

describe("stores-composition-policy-concurrency", () => {
  it("parseExpectedCompositionPolicyRevision accepts non-negative integers", () => {
    expect(parseExpectedCompositionPolicyRevision(0)).toBe(0);
    expect(parseExpectedCompositionPolicyRevision(3)).toBe(3);
    expect(parseExpectedCompositionPolicyRevision("7")).toBe(7);
  });

  it("parseExpectedCompositionPolicyRevision rejects missing or invalid", () => {
    expect(parseExpectedCompositionPolicyRevision(undefined)).toBe("invalid");
    expect(parseExpectedCompositionPolicyRevision(null)).toBe("invalid");
    expect(parseExpectedCompositionPolicyRevision(-1)).toBe("invalid");
    expect(parseExpectedCompositionPolicyRevision(1.5)).toBe("invalid");
    expect(parseExpectedCompositionPolicyRevision("x")).toBe("invalid");
  });

  it("isCompositionPolicyStaleError narrows stale_revision payloads", () => {
    expect(isCompositionPolicyStaleError({ error: "stale_revision", currentRevision: 4 })).toBe(true);
    expect(isCompositionPolicyStaleError({ error: "stale_revision" })).toBe(false);
    expect(isCompositionPolicyStaleError({ error: "other" })).toBe(false);
  });
});
