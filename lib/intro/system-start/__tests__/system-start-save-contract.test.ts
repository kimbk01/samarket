import { describe, expect, it } from "vitest";
import {
  parseMinVisibleMs,
  normalizeHexColor,
  parseBrandSizePreset,
} from "@/lib/intro/system-start/contract";

describe("system start save contract — fail-closed", () => {
  it("rejects out-of-contract minVisibleMs (no silent clamp)", () => {
    expect(parseMinVisibleMs(0)).toBeNull();
    expect(parseMinVisibleMs(750)).toBeNull();
    expect(parseMinVisibleMs(9999)).toBeNull();
    expect(parseMinVisibleMs(1500)).toBe(1500);
    expect(parseMinVisibleMs(500)).toBe(500);
  });

  it("rejects invalid colors and brand presets", () => {
    expect(normalizeHexColor("#GG0000")).toBeNull();
    expect(normalizeHexColor("#312E81")).toBe("#312E81");
    expect(parseBrandSizePreset("XL")).toBeNull();
    expect(parseBrandSizePreset("M")).toBe("M");
  });
});
