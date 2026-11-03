import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/** 광고 정리 1 — 빈 목록에서 첫 항목 등록 CTA (쓰기 권한 확인 포함) */
function emptyStateBlock(src: string, marker: string): string {
  const i = src.indexOf(marker);
  expect(i, marker).toBeGreaterThan(0);
  return src.slice(Math.max(0, i - 1500), i + 900);
}

describe("ads admin empty-state register CTA", () => {
  it.each([
    [
      "components/admin/ads/AdminAdvertisingWorkspace.tsx",
      "data-admin-ads-ops-empty-register",
      'useAdminWriteGuard("/admin/advertising/direct")',
      'href="/admin/advertising/direct"',
    ],
    [
      "components/admin/my/AdminMyBannersPage.tsx",
      "data-admin-my-banners-empty-create",
      'useAdminWriteGuard("/admin/my/banners")',
      'href="/admin/my/banners/create"',
    ],
    [
      "components/admin/ptr-reveal/AdminPtrRevealListPage.tsx",
      "data-admin-ptr-empty-create",
      'useAdminWriteGuard("/admin/ptr-reveal-ads")',
      "onClick={() => void create()}",
    ],
    [
      "components/admin/platform-popup/AdminPlatformPopupListPage.tsx",
      "data-admin-popup-empty-create",
      'useAdminWriteGuard("/admin/platform-popup")',
      "onClick={() => void onCreate()}",
    ],
    [
      "components/admin/platform-promotion/AdminPromotionBannerListClient.tsx",
      "data-admin-promotion-banner-empty-create",
      'useAdminWriteGuard("/admin/platform-events")',
      'href="/admin/platform-events/new"',
    ],
    [
      "components/admin/stores/AdminDeliveryAdsControlPlane.tsx",
      "data-admin-delivery-ads-empty-create",
      'useAdminWriteGuard("/admin/delivery-ads")',
      "href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew}",
    ],
  ])("%s — AdminEmptyState action → create, guarded", (file, marker, guard, target) => {
    const src = read(file);
    expect(src).toContain(guard);
    const block = emptyStateBlock(src, marker);
    expect(block).toContain("action={");
    expect(block).toContain(target);
    // 권한 없으면 비활성 버튼(사유 title) — 링크만 두지 않는다
    expect(block).toMatch(/disabled/);
  });
});
