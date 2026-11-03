import { describe, expect, it } from "vitest";
import { launchIntroCtaTextColor } from "@/components/launch-intro/LaunchIntroSceneView";

/** 광고 감사 I-9 — 흰 CTA 버튼 위 글자 대비 (WCAG 큰·굵은 글자 3:1) */
describe("launchIntroCtaTextColor", () => {
  it("keeps the scene colour when it contrasts with white", () => {
    expect(launchIntroCtaTextColor("#0B421A")).toBe("#0B421A");
    expect(launchIntroCtaTextColor("#000000")).toBe("#000000");
  });
  it("falls back to the default text colour on near-white backgrounds", () => {
    expect(launchIntroCtaTextColor("#FFFFFF")).toBe("var(--sam-fg, #1f2937)");
    expect(launchIntroCtaTextColor("#F5F5F5")).toBe("var(--sam-fg, #1f2937)");
    expect(launchIntroCtaTextColor("#FFD400")).toBe("var(--sam-fg, #1f2937)");
  });
});
