import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMainTier1Subpage } from "@/lib/layout/resolve-main-tier1";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("commerce hub tier1 SSOT", () => {
  it("CommerceHubChromeSync writes rightSlot only — no static chrome duplication", () => {
    const sync = read("components/orders/customer-commerce/CommerceHubChromeSync.tsx");
    expect(sync).toMatch(/rightSlot/);
    expect(sync).not.toMatch(/titleText:/);
    expect(sync).not.toMatch(/backHref:/);
    expect(sync).not.toMatch(/preferHistoryBack:/);
    expect(sync).not.toMatch(/showHubQuickActions:/);
  });

  it("resolveMainTier1Subpage owns hub alias static back contract to /stores", () => {
    const activity = resolveMainTier1Subpage("/orders/activity");
    expect(activity?.backHref).toBe("/stores");
    expect(activity?.preferHistoryBack).toBe(false);
    expect(resolveMainTier1Subpage("/mypage/coupons")?.backHref).toBe("/stores");
    expect(resolveMainTier1Subpage("/mypage/gift-certificates")?.backHref).toBe("/stores");
    expect(activity?.titleText).toBe("commerce_hub_title");
    expect(resolveMainTier1Subpage("/mypage/coupons")?.titleText).toBe("commerce_hub_title");
    expect(resolveMainTier1Subpage("/mypage/gift-certificates")?.titleText).toBe("commerce_hub_title");
  });
});
