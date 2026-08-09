import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Messenger image expand must not size against room-panel viewport units or live under
 * `.messenger-page` transform without a body portal (device viewport spill).
 */
describe("MessengerImageLightbox viewport contract", () => {
  const src = readFileSync(
    join(process.cwd(), "components/community-messenger/room/MessengerImageLightbox.tsx"),
    "utf8"
  );

  it("portals to document.body", () => {
    expect(src).toMatch(/createPortal/);
    expect(src).toMatch(/document\.body/);
  });

  it("does not size image with viewport vh/dvh units", () => {
    expect(src).not.toMatch(/className="[^"]*(?:100|88)(?:dvh|vh)/);
    expect(src).not.toMatch(/max-h-\[[^\]]*(?:dvh|vh)/);
  });

  it("clips overflow on the lightbox root and image stage", () => {
    expect(src).toMatch(/overflow-hidden/);
    expect(src).toMatch(/max-h-full max-w-full object-contain/);
  });

  it("owns safe-area on the portaled root (not safe-bottom on top chrome only)", () => {
    expect(src).toMatch(/pt-\[var\(--safe-top\)\]/);
    expect(src).toMatch(/pb-\[var\(--safe-bottom\)\]/);
    expect(src).not.toMatch(/pb-\[max\(0\.5rem,var\(--safe-bottom\)\)\]/);
  });
});
