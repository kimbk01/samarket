import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));

import { buildPlatformPopupEffectiveSuppressionFilter } from "@/lib/platform-popup/load-popup-candidates";
import {
  platformPopupRevisionMatches,
  withPlatformPopupDestinationRevision,
} from "@/lib/platform-popup/popup-campaign-revision";
import { isPlatformPopupSuppressionActive } from "@/lib/platform-popup/suppression";
import { platformPopupInternalPathEntity, validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { popupCtaInputEntityKey } from "@/lib/platform-popup/popup-event-destination-availability";
import { resolveDibaySurface } from "@/lib/platform-popup/resolve-dibay-surface";
import { isPlatformPopupAdvertisingSurface } from "@/lib/platform-popup/resolve-dibay-surface";
import { adminBulkDeletePlatformPopupDraftCampaigns } from "@/lib/platform-popup/admin-campaign-delete-draft";
import { waitPlatformPopupImageReady } from "@/lib/platform-popup/popup-image-ready";
import { compareMyPageBannersForCustomer, myPageBannerLiveQuerySpec } from "@/lib/my/mypage-tables-select";
import { filterMyPageBannersWithLiveDestination, validateMyPageBannerLinkForSave } from "@/lib/my/my-page-banner-destination";
import { verifyDeliveryAdExposureToken, issueEligibleDeliveryAdExposure } from "@/lib/stores/advertising/delivery-ad-exposure-token";

describe("D-21 ② 숨김 조회 = 효과 있는 행 + 기간 안", () => {
  const now = new Date("2026-11-04T00:00:00.000Z");
  it("CLOSE 제외 · TODAY/DURATION 은 기간 안 · CAMPAIGN 항상 · SESSION 은 같은 실행 키만", () => {
    const f = buildPlatformPopupEffectiveSuppressionFilter({ now, sessionKey: "a1b2-c3" });
    expect(f).toBe(
      "mode.eq.CAMPAIGN,and(mode.in.(TODAY,DURATION),suppress_until.gt.2026-11-04T00:00:00.000Z),and(mode.eq.SESSION,session_key.eq.a1b2-c3)"
    );
    expect(f).not.toContain("CLOSE");
  });
  it("형식 밖 실행 키는 필터에 넣지 않는다(주입 방지)", () => {
    expect(buildPlatformPopupEffectiveSuppressionFilter({ now, sessionKey: "x),mode.eq.CLOSE" })).not.toContain("SESSION");
  });
});

describe("D-2 「다시 보지 않기」 판 = 이미지 + 목적지", () => {
  const cta = (target: string) => ({ ctaType: "internal_page", ctaTarget: target, externalUrl: null });
  const rec = (rev: string) => ({ mode: "CAMPAIGN" as const, campaignRevision: rev });
  const now = new Date();
  it("① 같은 이미지·같은 목적지(제목·본문만 수정) → 계속 숨김", () => {
    const a = withPlatformPopupDestinationRevision("cr1", cta("/market"))!;
    const b = withPlatformPopupDestinationRevision("cr1", cta("/market"))!;
    expect(isPlatformPopupSuppressionActive(rec(a), { now, currentCampaignRevision: b })).toBe(true);
  });
  it("② 이미지 교체 → 다시 보임", () => {
    const a = withPlatformPopupDestinationRevision("cr1", cta("/market"))!;
    const b = withPlatformPopupDestinationRevision("cr2", cta("/market"))!;
    expect(isPlatformPopupSuppressionActive(rec(a), { now, currentCampaignRevision: b })).toBe(false);
  });
  it("③ 목적지 변경 → 다시 보임 · 예전 형식 행(소재 id 만)은 소재만 비교", () => {
    const a = withPlatformPopupDestinationRevision("cr1", cta("/market"))!;
    const b = withPlatformPopupDestinationRevision("cr1", cta("/philife"))!;
    expect(isPlatformPopupSuppressionActive(rec(a), { now, currentCampaignRevision: b })).toBe(false);
    expect(platformPopupRevisionMatches("cr1", b)).toBe(true);
    expect(platformPopupRevisionMatches("cr0", b)).toBe(false);
  });
});

describe("DS-5 · DS-5b CTA", () => {
  it("DS-5: 앱 안 경로 빈칸은 통과하지 못한다", () => {
    expect(validatePlatformPopupCta({ ctaType: "internal_page", ctaTarget: "" }).ok).toBe(false);
  });
  it("DS-5b: 글·매장 경로는 대상 확인 키가 생기고, 대상이 없으면 막힌다", () => {
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/post/p1" })).toEqual({ kind: "trade_listing", target: "p1" });
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/philife/post/3e2d5995-f0a5-425e-bed8-13426eca634c" })?.kind).toBe("community_post");
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/philife/3e2d5995-f0a5-425e-bed8-13426eca634c" })?.kind).toBe("community_post");
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/stores/aa11" })).toEqual({ kind: "store", target: "aa11" });
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/stores/browse" })).toBeNull();
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/philife/write" })).toBeNull();
    expect(platformPopupInternalPathEntity({ ctaType: "internal_page", href: "/market" })).toBeNull();
    expect(popupCtaInputEntityKey({ ctaType: "internal_page", ctaTarget: "/stores/aa11" })).toBe("store:aa11");
    const input = { ctaType: "internal_page", ctaTarget: "/post/p1" };
    expect(validatePlatformPopupCta(input, { exists: false, visible: false })).toEqual({ ok: false, error: "target_deleted" });
    expect(validatePlatformPopupCta(input, { exists: true, visible: true, authorized: true }).ok).toBe(true);
    // 일반 경로는 대상 확인 없이 통과(기존 그대로)
    expect(validatePlatformPopupCta({ ctaType: "internal_page", ctaTarget: "/market" }, null).ok).toBe(true);
  });
});

describe("D-26 거래 글쓰기에는 팝업 없음", () => {
  it("/write · /write/{카테고리} 는 광고 영역이 아니다 · /market 은 그대로", () => {
    expect(isPlatformPopupAdvertisingSurface(resolveDibaySurface("/write"))).toBe(false);
    expect(isPlatformPopupAdvertisingSurface(resolveDibaySurface("/write/abc"))).toBe(false);
    expect(resolveDibaySurface("/market")).toBe("TRADE");
  });
});

describe("D-27 이미지 준비 대기", () => {
  type Img = { onload: (() => void) | null; onerror: (() => void) | null; src: string; decode?: () => Promise<void> };
  it("decode 끝나면 ready · 오류면 failed · 3초 넘으면 timeout", async () => {
    let img!: Img;
    const make = () => (img = { onload: null, onerror: null, src: "", decode: () => Promise.resolve() });
    const p1 = waitPlatformPopupImageReady("https://a/b.webp", { createImage: make });
    img.onload!();
    expect(await p1).toBe("ready");
    const p2 = waitPlatformPopupImageReady("https://a/b.webp", { createImage: make });
    img.onerror!();
    expect(await p2).toBe("failed");
    vi.useFakeTimers();
    const p3 = waitPlatformPopupImageReady("https://a/b.webp", { createImage: make });
    vi.advanceTimersByTime(3000);
    expect(await p3).toBe("timeout");
    vi.useRealTimers();
  });
});

describe("AL-20 일괄 삭제 — 1건씩 + 실패 목록", () => {
  it("중간 실패해도 나머지를 지우고 지운 id·실패 목록을 돌려준다", async () => {
    const table = [
      { id: "a", status: "draft", owner_store_id: null, owner_request_id: null },
      { id: "b", status: "draft", owner_store_id: null, owner_request_id: null },
      { id: "c", status: "draft", owner_store_id: null, owner_request_id: null },
    ];
    const sb = {
      from(name: string) {
        if (name === "platform_popup_campaign_events") {
          return { select: () => ({ eq: async () => ({ count: 0, error: null }) }) };
        }
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: table.find((r) => r.id === id) ?? null, error: null }) }),
            in: async () => ({ data: table, error: null }),
          }),
          delete: () => ({ eq: async (_c: string, id: string) => ({ error: id === "b" ? { message: "fk secret" } : null }) }),
        };
      },
    };
    const r = await adminBulkDeletePlatformPopupDraftCampaigns(sb as never, { campaignIds: ["a", "b", "c"], adminUserId: "x" });
    expect(r).toMatchObject({ ok: false, error: "partial_delete_failed", deletedIds: ["a", "c"], failed: [{ id: "b", error: "delete_failed" }] });
    expect(JSON.stringify(r)).not.toContain("fk secret");
  });
});

describe("마이 배너 MB-C04 · MB-A03 · DS-7", () => {
  it("MB-C04 정렬 = priority → sort_order → created_at 최신", () => {
    const rows = [
      { id: "x", priority: 2, sort_order: 0, created_at: "2026-01-01" },
      { id: "y", priority: 1, sort_order: 5, created_at: "2026-01-01" },
      { id: "z", priority: 1, sort_order: 5, created_at: "2026-02-01" },
      { id: "w", priority: 1, sort_order: 1, created_at: "2026-01-01" },
    ];
    expect([...rows].sort(compareMyPageBannersForCustomer).map((r) => r.id)).toEqual(["w", "z", "y", "x"]);
  });
  it("MB-A03 노출 조건 1개 = is_active + 시작 ≤ 지금 + 종료 순간 제외", () => {
    expect(myPageBannerLiveQuerySpec("2026-11-04T00:00:00.000Z")).toEqual({
      activeColumn: "is_active",
      activeValue: true,
      startOr: "start_at.is.null,start_at.lte.2026-11-04T00:00:00.000Z",
      endOr: "end_at.is.null,end_at.gt.2026-11-04T00:00:00.000Z",
    });
  });
  it("DS-7 저장: 링크 필수 · 외부 거부 · 앱 안 경로·이벤트 허용", () => {
    expect(validateMyPageBannerLinkForSave("")).toEqual({ ok: false, error: "link_required" });
    expect(validateMyPageBannerLinkForSave("https://example.com")).toEqual({ ok: false, error: "external_link_forbidden" });
    expect(validateMyPageBannerLinkForSave("/events/e1")).toEqual({ ok: true, href: "/events/e1" });
    expect(validateMyPageBannerLinkForSave("/mypage/points")).toEqual({ ok: true, href: "/mypage/points" });
  });
  it("DS-7 노출: 링크 없음·끝난 이벤트 배너 제외 · 진행 중 이벤트·일반 경로·(기존) 외부 링크 유지", async () => {
    const live = "4b366b69-a80d-4c0d-9689-f358551a8c40";
    const ended = "5b366b69-a80d-4c0d-9689-f358551a8c40";
    const sb = {
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [
              { id: live, status: "published", starts_at: "2026-01-01T00:00:00Z", ends_at: "2027-01-01T00:00:00Z" },
              { id: ended, status: "published", starts_at: "2026-01-01T00:00:00Z", ends_at: "2026-02-01T00:00:00Z" },
            ],
            error: null,
          }),
        }),
      }),
    };
    const rows = [
      { id: "1", link_url: "" },
      { id: "2", link_url: `/events/${ended}` },
      { id: "3", link_url: `/events/${live}` },
      { id: "4", link_url: "/mypage/points" },
      { id: "5", link_url: "https://example.com/qa" },
    ];
    const out = await filterMyPageBannersWithLiveDestination(sb as never, rows, Date.parse("2026-11-04T00:00:00Z"));
    expect(out.map((r) => r.id)).toEqual(["3", "4", "5"]);
  });
});

describe("D-28 매장 없는 배달 자체 배너 노출 토큰", () => {
  it("storeId null 로 발급·검증된다", () => {
    const { token } = issueEligibleDeliveryAdExposure({
      campaignId: "c1",
      productKind: "banner",
      storeId: null,
      surface: "STORES_HOME_HERO",
      destinationType: "store_detail",
      destinationId: "",
    });
    const v = verifyDeliveryAdExposureToken(token);
    expect(v.ok && v.payload.storeId).toBe(null);
  });
});
