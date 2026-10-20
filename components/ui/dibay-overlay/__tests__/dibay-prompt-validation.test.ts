import { describe, expect, it } from "vitest";
import { isDibayPromptValueValid } from "@/components/ui/dibay-overlay/DibayPromptDialog";

describe("isDibayPromptValueValid", () => {
  it("keeps the old behaviour without new rules", () => {
    expect(isDibayPromptValueValid({ value: "" })).toBe(true);
    expect(isDibayPromptValueValid({ value: "  ", required: true })).toBe(false);
    expect(isDibayPromptValueValid({ value: "a", required: true })).toBe(true);
  });

  it("minLength counts the trimmed value", () => {
    expect(isDibayPromptValueValid({ value: " a ", required: true, minLength: 2 })).toBe(false);
    expect(isDibayPromptValueValid({ value: " ab ", required: true, minLength: 2 })).toBe(true);
  });

  it("mustEqual requires the exact retyped value", () => {
    expect(isDibayPromptValueValid({ value: "ORD-1", mustEqual: "ORD-12" })).toBe(false);
    expect(isDibayPromptValueValid({ value: " ORD-12 ", mustEqual: "ORD-12" })).toBe(true);
  });
});
