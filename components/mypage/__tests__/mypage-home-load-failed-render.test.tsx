import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({
    language: "ko",
    t: (key: string) => key,
    safeT: (_key: string, opts?: { fallbackKo?: string }) => opts?.fallbackKo ?? "",
    tt: (text: string) => text,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, prefetch: () => {} }) }));
vi.mock("@/components/mypage/profile-settings/mypage-profile-sheets-context", () => ({
  useMypageProfileSheets: () => ({ openSheet: () => {}, setOnProfileUpdated: () => {} }),
  useMypageProfileSheetsOptional: () => null,
}));
vi.mock("@/hooks/use-mypage-home-summary", () => ({ useMypageHomeSummary: () => null }));
vi.mock("@/lib/chats/use-owner-hub-badge-total", () => ({ useOwnerHubBadgeBreakdown: () => ({ chatUnread: 0 }) }));
vi.mock("@/components/mypage/myinfo/MyInfoHomeMenuSections", () => ({ useCustomerCenterUnreadTotal: () => 0 }));
vi.mock("@/components/mypage/myinfo/MyInfoHomeCategoryHub", () => ({
  MyInfoHomeCategoryGrid: () => null,
  MyInfoHomeNowStrip: () => null,
}));
vi.mock("@/components/mypage/home/MypageHomeCmsBanner", () => ({ MypageHomeCmsBanner: () => null }));
vi.mock("@/components/mypage/home/MypageSessionReloginCard", () => ({ MypageSessionReloginCard: () => null }));
vi.mock("@/components/profile/SamarketUserAvatar", () => ({ SamarketUserAvatar: () => null }));

import { MyPageHomeDashboard } from "@/components/mypage/MyPageHomeDashboard";
import type { MypageHomeProjection } from "@/lib/mypage/mypage-home-store";
import type { ProfileRow } from "@/lib/profile/types";

const profile = {
  id: "u1",
  dibay_id: "kim01",
  dibay_id_locked: true,
  phone: "+639171234567",
  phone_verified: true,
  phone_verification_status: "verified",
} as unknown as ProfileRow;

function projection(addressStatus: MypageHomeProjection["addressStatus"]): MypageHomeProjection {
  return {
    viewerId: "u1",
    profile,
    displayName: "김테스트",
    avatarUrl: null,
    username: "@kim01",
    bio: null,
    profileUpdatedAt: null,
    hasDibayId: true,
    phoneStatus: "complete",
    addressStatus,
    addressPublicLabel: null,
    addressActiveCount: null,
  };
}

function rowState(html: string, key: string): string | null {
  const m = html.match(new RegExp(`data-testid="mypage-account-row-${key}" data-state="([^"]+)"`));
  return m?.[1] ?? null;
}

describe("mypage home — timeout lands on existing error UX (no endless skeleton)", () => {
  it("profile timed out, no projection: load-failed card + retry button, required rows show 확인 불가 (not skeleton)", () => {
    const html = renderToStaticMarkup(
      <MyPageHomeDashboard projection={null} loadFailed onProfileRefresh={() => {}} />,
    );
    expect(html).toContain('data-testid="mypage-home-load-failed"');
    expect(html).toContain("mypage_home_load_failed");
    expect(html).toContain("common_retry");
    expect(html).not.toContain('data-testid="mypage-account-rows-skeleton"');
    expect(html).not.toContain('data-testid="mypage-profile-summary-skeleton"');
    for (const key of ["handle", "phone", "address"]) expect(rowState(html, key)).toBe("error");
  });

  it("address timed out, profile ok: profile card and handle/phone rows stay visible; only address row is 확인 불가 + retry", () => {
    const html = renderToStaticMarkup(
      <MyPageHomeDashboard projection={projection("unknown")} loadFailed onProfileRefresh={() => {}} />,
    );
    expect(html).not.toContain('data-testid="mypage-home-load-failed"');
    expect(html).toContain('data-testid="mypage-profile-summary-card"');
    expect(html).toContain("김테스트");
    expect(rowState(html, "handle")).not.toBe("error");
    expect(rowState(html, "phone")).toBe("verified");
    expect(rowState(html, "address")).toBe("error");
    expect(html).toContain('data-testid="mypage-account-cta-address"');
  });

  it("still pending (no failure yet): skeleton is shown — the only way out is settle, which the deadline now guarantees", () => {
    const html = renderToStaticMarkup(<MyPageHomeDashboard projection={null} onProfileRefresh={() => {}} />);
    expect(html).toContain('data-testid="mypage-profile-summary-skeleton"');
    expect(html).toContain('data-testid="mypage-account-rows-skeleton"');
  });
});
