import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("store order review layout contract", () => {
  it("uses viewport-locked flex shell (middle scroll, inline footer CTA)", () => {
    const layout = readRepo("lib/stores/store-order-review-page-layout.ts");
    expect(layout).toContain("STORE_ORDER_REVIEW_PAGE_ROOT_CLASS");
    expect(layout).toContain("STORE_ORDER_REVIEW_SCROLL_BODY_CLASS");
    expect(layout).toContain("STORE_ORDER_REVIEW_FOOTER_CHROME_CLASS");
    expect(layout).toMatch(/overflow-y-auto/);
    expect(layout).toMatch(/flex-1/);

    const form = readRepo("components/mypage/StoreOrderReviewForm.tsx");
    expect(form).toContain("inline");
    expect(form).toContain("STORE_ORDER_REVIEW_FOOTER_CHROME_CLASS");
    expect(form).toContain("STORE_ORDER_REVIEW_VIEWPORT_SHELL_CLASS");
    expect(form).not.toContain("storeCommerceActionContentPadClass");
    expect(form).not.toMatch(/setErr\(\s*["']load_failed["']/);
    expect(form).not.toMatch(/setErr\(\s*["']network_error["']/);

    const flags = readRepo("lib/layout/conditional-app-shell-flags.ts");
    expect(flags).toContain("isStoreOrderReviewPage");
    expect(flags).toContain("isMainColumnViewportLocked");
  });
});
