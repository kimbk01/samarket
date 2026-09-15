import { describe, expect, it } from "vitest";
import { normalizeProductIntroConfig } from "@/lib/startup/product-intro";
import {
  productIntroGenerationId,
  toNativeProductIntroPayload,
} from "@/lib/startup/product-intro-native-sync";

describe("product intro Native sync", () => {
  it("includes presentation metadata in generation identity and payload", () => {
    const base = normalizeProductIntroConfig({
      status: "active",
      media: { mobileUrl: "https://cdn.example/first-entry.webp" },
      updatedAt: "2026-09-16T00:00:00.000Z",
      sizePreset: "max",
      animationIn: "fade_in",
      animationOut: "expand_fade_out",
    });
    const small = normalizeProductIntroConfig({ ...base, sizePreset: "small" });

    expect(productIntroGenerationId(small)).not.toBe(productIntroGenerationId(base));
    expect(toNativeProductIntroPayload(small)).toMatchObject({
      presentationSizePreset: "small",
      enterMotion: "fade_in",
      exitMotion: "expand_fade_out",
      enterDurationMs: 220,
      exitDurationMs: 260,
    });
  });
});
