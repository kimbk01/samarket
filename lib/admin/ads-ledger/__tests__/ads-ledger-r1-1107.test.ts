/**
 * 광고 원장 R1 (설계 ads-admin-ssot-design-2026-11-07 §1·§2·§5·§6 · 2026-11-07) — 동작 시험.
 * 위치 문구 1개 함수 · 원장 행 → 광고주·결제·상태(기간 만료) · 바로 가기 권한 · 로더(원장 RPC · 옛 함수 대체 · 새 종류 행) · 위치 지도 칸.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adLocationLabel, adLocationFilterValue, parseAdLocationFilterValue } from "@/lib/admin/ads-ledger/ad-location-label";
import {
  ADS_LEDGER_KINDS,
  SUPPORT_FILTERABLE_AD_REFERENCE_TYPES,
  adsLedgerAdvertiserLabel,
  adsLedgerPaymentLabel,
  adsLedgerPerformanceLabel,
  adsLedgerStatusLabel,
  buildAdsLedgerShortcuts,
  parseAdsLedgerRow,
} from "@/lib/admin/ads-ledger/ad-ledger-presentation";
import { projectLedgerSurfaceMap } from "@/lib/admin/ads-exposure/placement-inventory";
import { listWorkspaceDrawerActions } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import { resolveSupportReferenceAdminHref, resolveSupportCaseContextLinks } from "@/lib/support/support-reference-admin-href";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const baseRow = {
  kind: "trade_promotion",
  status_tab: "live",
  ledger_domain: "trade",
  location_key: "TRADE_BOOST_TOP",
  advertiser_type: "member",
  advertiser_id: "11111111-1111-4111-8111-111111111111",
  advertiser_name: "철수",
  pay_currency: "POINT",
  pay_amount: 300,
  pay_status: "paid",
  delete_kind: "trade_promotion",
};

describe("§1-3 위치 문구 — 설계 예문 그대로 (함수 1개)", () => {
  const cases: Array<[Parameters<typeof adLocationLabel>[0], string]> = [
    [{ locationKey: "TRADE_BOOST_TOP" }, "거래 홈 › 목록 2번째 칸 (위쪽 1자리)"],
    [{ locationKey: "COMMUNITY_BOOST_TOP" }, "커뮤니티 › 목록 맨 위 1자리"],
    [{ locationKey: "TRADE_HOME" }, "거래 홈 › 피드 배너(글 4~6개마다)"],
    [{ locationKey: "COMMUNITY_TOPIC", locationTarget: "local", locationTargetName: "동네소식" }, "커뮤니티 › 주제 ‘동네소식’ 피드 배너"],
    [{ locationKey: "STORES_HOME_HERO" }, "DIPICK 홈 › 상단 히어로(최대 5)"],
    [{ locationKey: "STORES_CATEGORY_TOP", locationTarget: "chicken", locationTargetName: "치킨" }, "배달 › 업종 ‘치킨’ 상단"],
    [{ locationKey: "STORES_SEARCH_TOP" }, "배달 › 검색 결과 상단"],
    [{ locationKey: "STORES_HOME_FEED" }, "배달 › 매장 목록(홈) 끼움"],
    [{ locationKey: "POPUP", locationTarget: "COMMUNITY,TRADE,DELIVERY,MYPAGE" }, "팝업 › 커뮤니티·거래·배달·MY"],
    [{ locationKey: "PTR", locationTarget: "GLOBAL" }, "PTR › 커뮤니티·거래·매장 홈·browse"],
    [{ locationKey: "MYPAGE_TOP" }, "MY › 프로필 아래"],
    [{ locationKey: "APP_INTRO" }, "앱 시작 › 인트로(새로 실행할 때)"],
  ];
  it.each(cases)("%o → %s", (input, expected) => {
    expect(adLocationLabel(input, true)).toBe(expected);
  });
  it("모르는 키는 원문 코드값 대신 「위치 확인 못 함」", () => {
    expect(adLocationLabel({ locationKey: "WEIRD_KEY" }, true)).toBe("위치 확인 못 함");
  });
  it("위치 거름 값 왕복 (위치 지도 칸 → 원장)", () => {
    expect(parseAdLocationFilterValue(adLocationFilterValue("STORES_CATEGORY_TOP", "chicken"))).toEqual({
      key: "STORES_CATEGORY_TOP",
      target: "chicken",
    });
    expect(parseAdLocationFilterValue("x;drop")).toBeNull();
  });
});

describe("§1-3 원장 칸 — 광고주·결제·상태·성과", () => {
  it("13종 = DB 종류 값 (이벤트 콘텐츠 제외)", () => {
    expect(ADS_LEDGER_KINDS).toHaveLength(13);
    expect(ADS_LEDGER_KINDS).toEqual(expect.arrayContaining(["ptr", "my_banner", "intro", "event_hero", "feed_event"]));
  });
  it("광고주 이름: 회원 닉네임 · 운영자 · 이벤트 제목 (uuid 앞자리 없음)", () => {
    const l = parseAdsLedgerRow(baseRow)!;
    expect(adsLedgerAdvertiserLabel(l, true)).toBe("철수");
    expect(adsLedgerAdvertiserLabel({ advertiserType: "operator", advertiserName: null }, true)).toBe("운영자");
    expect(adsLedgerAdvertiserLabel({ advertiserType: "event", advertiserName: "가을 행사" }, true)).toBe("이벤트: 가을 행사");
  });
  it("결제: 통화 + 금액 + 상태 (환급 N · 결제 없음)", () => {
    expect(adsLedgerPaymentLabel(parseAdsLedgerRow(baseRow)!, true)).toBe("포인트 · 300P · 결제 완료");
    expect(
      adsLedgerPaymentLabel(parseAdsLedgerRow({ ...baseRow, pay_status: "partial_refund", refund_amount: 120 })!, true)
    ).toBe("포인트 · 300P · 결제 완료 · 환급 120P");
    expect(adsLedgerPaymentLabel(parseAdsLedgerRow({ ...baseRow, pay_currency: "NONE", pay_status: "none" })!, true)).toBe(
      "결제 없음"
    );
  });
  it("AA-14: 기간이 지난 정지 = 「종료(기간 만료)」 · 정지는 누가", () => {
    const l = parseAdsLedgerRow({ ...baseRow, status_tab: "ended", ended_reason: "expired" })!;
    expect(adsLedgerStatusLabel(l.statusTab, l, true)).toBe("종료(기간 만료)");
    expect(adsLedgerStatusLabel("paused", { endedReason: null, pausedBy: "admin" }, true)).toBe("정지(운영자)");
    expect(adsLedgerStatusLabel("paused", { endedReason: null, pausedBy: "listing_sold" }, true)).toBe("정지(글 상태)");
  });
  it("성과: 기록 없는 종류는 「기록 없음」", () => {
    expect(adsLedgerPerformanceLabel({ impressions: null, clicks: null }, true)).toBe("기록 없음");
    expect(adsLedgerPerformanceLabel({ impressions: 1200, clicks: 3 }, true)).toBe("노출 1,200 · 클릭 3");
  });
});

describe("§2 바로 가기 — 권한 키 · 결제 있는 광고만 충전", () => {
  it("회원 상위노출: 문의(support) · 포인트(point) · 회원 상세", () => {
    const sc = buildAdsLedgerShortcuts({ sourceId: "o1", detailHref: "/d", ledger: parseAdsLedgerRow(baseRow)! }, true);
    expect(sc.map((s) => s.id)).toEqual(["detail", "inquiry", "charge", "advertiser"]);
    expect(sc.find((s) => s.id === "inquiry")).toMatchObject({
      href: "/admin/support?reference_type=POINT_PROMOTION_ORDER&reference_id=o1",
      requirement: { kind: "permission", key: "support" },
    });
    expect(sc.find((s) => s.id === "charge")).toMatchObject({ requirement: { kind: "permission", key: "point" } });
  });
  it("매장 배달 광고: 캐시 충전(business) · 매장 상세", () => {
    const l = parseAdsLedgerRow({
      ...baseRow,
      kind: "delivery_banner",
      advertiser_type: "store",
      advertiser_id: "22222222-2222-4222-8222-222222222222",
      pay_currency: "BUSINESS_CASH",
    })!;
    const sc = buildAdsLedgerShortcuts({ sourceId: "c1", detailHref: "/d", ledger: l }, true);
    expect(sc.find((s) => s.id === "charge")).toMatchObject({
      href: "/admin/delivery-ads/cash-charges?storeId=22222222-2222-4222-8222-222222222222",
      requirement: { kind: "permission", key: "business" },
    });
    expect(sc.find((s) => s.id === "advertiser")?.href).toBe("/admin/business/22222222-2222-4222-8222-222222222222");
  });
  it("운영자 팝업: 충전 숨김 · 문의는 고객센터가 아직 못 거르는 종류라 id 검색", () => {
    const l = parseAdsLedgerRow({
      ...baseRow,
      kind: "popup_admin",
      advertiser_type: "operator",
      advertiser_id: null,
      pay_currency: "NONE",
      pay_status: "none",
    })!;
    const sc = buildAdsLedgerShortcuts({ sourceId: "p1", detailHref: "/d", ledger: l }, true);
    expect(sc.map((s) => s.id)).toEqual(["detail", "inquiry"]);
    expect(sc[1]!.href).toBe("/admin/support?search=p1");
  });
  it("고객센터가 거를 수 있다고 둔 종류 ⊂ SUPPORT_REFERENCE_TYPES", () => {
    const src = read("lib/support/support-reference-authority.ts");
    for (const t of SUPPORT_FILTERABLE_AD_REFERENCE_TYPES) expect(src).toContain(`"${t}"`);
  });
});

describe("§2 문의 참조 종류 추가 · 반대 방향 링크", () => {
  it("운영자 팝업·PTR·피드 운영자 캠페인·이벤트 배너 참조 → 어드민 화면", () => {
    expect(resolveSupportReferenceAdminHref("PLATFORM_POPUP_CAMPAIGN", "a")?.href).toBe("/admin/platform-popup/a");
    expect(resolveSupportReferenceAdminHref("PTR_REVEAL_CAMPAIGN", "b")?.href).toBe("/admin/ptr-reveal-ads/b");
    expect(resolveSupportReferenceAdminHref("FEED_AD_CAMPAIGN", "c")?.href).toBe("/admin/feed-ads/c/edit");
    expect(resolveSupportReferenceAdminHref("EVENT_BANNER", "d")?.href).toBe("/admin/advertising?kind=event_hero");
  });
  it("문의 상세 → 「이 광고주의 광고」 (회원·매장)", () => {
    const links = resolveSupportCaseContextLinks({ ownerStoreId: "s1", requesterUserId: "u1" });
    const hrefs = links.map((l) => l.href);
    expect(hrefs).toContain("/admin/advertising?advertiser=s1");
    expect(hrefs).toContain("/admin/advertising?advertiser=u1");
  });
  it("포인트 충전 상세 · 캐시 충전 대기열에 같은 링크 1줄", () => {
    expect(read("components/admin/points/AdminPointChargeDetailPage.tsx")).toContain("data-admin-charge-advertiser-ads");
    expect(read("components/admin/stores/AdminDeliveryAdCashChargeQueuePage.tsx")).toContain(
      "data-admin-cash-charge-advertiser-ads"
    );
  });
});

describe("§5 위치 지도 — 지면 전체 · 칸 → 원장 거름", () => {
  it("배달 5곳 + 업종별 · 피드 4 · 상위노출 2 · 팝업·PTR 화면 · 마이 · 인트로 · 이벤트", () => {
    const cells = projectLedgerSurfaceMap([
      { locationKey: "STORES_HOME_HERO", locationTarget: null, locationTargetName: null, statusTab: "live", n: 3 },
      { locationKey: "STORES_CATEGORY_TOP", locationTarget: "cafe", locationTargetName: "카페", statusTab: "live", n: 1 },
      { locationKey: "POPUP", locationTarget: "COMMUNITY,TRADE", locationTargetName: null, statusTab: "scheduled", n: 2 },
    ]);
    const hero = cells.find((c) => c.locationKey === "STORES_HOME_HERO")!;
    expect(hero).toMatchObject({ capacity: 5, live: 3, vacant: 2, ledgerHref: "/admin/advertising?location=STORES_HOME_HERO" });
    const cafe = cells.find((c) => c.locationKey === "STORES_CATEGORY_TOP" && c.locationTarget === "cafe")!;
    expect(cafe.ledgerHref).toBe(`/admin/advertising?location=${encodeURIComponent("STORES_CATEGORY_TOP|cafe")}`);
    expect(cells.find((c) => c.locationKey === "POPUP" && c.locationTarget === "TRADE")?.scheduled).toBe(2);
    expect(cells.find((c) => c.locationKey === "POPUP" && c.locationTarget === "MYPAGE")?.scheduled).toBe(0);
    const keys = new Set(cells.map((c) => c.locationKey));
    for (const k of ["STORES_HOME_INLINE_1", "STORES_SEARCH_TOP", "STORES_HOME_FEED", "TRADE_CATEGORY", "COMMUNITY_TOPIC", "TRADE_BOOST_TOP", "PTR", "MYPAGE_TOP", "APP_INTRO", "EVENT_HERO"]) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});

describe("D-03 · retype 제거 · 죽은 코드", () => {
  it("진행 중 배달 광고에 강제 종료(terminate) 버튼 없음", () => {
    for (const family of ["delivery_banner", "delivery_sponsored"] as const) {
      expect(listWorkspaceDrawerActions({ family, statusRaw: "노출 중" })).not.toContain("terminate");
    }
  });
  it("공통 화면에 대상 재입력(retypeValue) 인자 0 · 옛 관제 화면 삭제", () => {
    expect(read("components/admin/ads/AdminAdvertisingWorkspace.tsx")).not.toMatch(/retypeValue\s*[:,]/);
    expect(() => read("components/admin/ads/AdminAdsExposureControlPlane.tsx")).toThrow();
  });
  it("드로어에 R2 삭제 공용 버튼 (원장 패널)", () => {
    expect(read("components/admin/ads/AdminAdsLedgerParts.tsx")).toContain("<AdminAdDeleteAction");
    expect(read("components/admin/ads/AdminAdvertisingWorkspace.tsx")).toContain("<AdminAdsLedgerDrawerPanel");
  });
  it("AD2-13: 예전 주소는 모두 같은 원장 + 도메인 거름", () => {
    const src = read("app/admin/ad-applications/page.tsx");
    expect(src).toContain("/admin/advertising/boosts?domain=${domain}");
    expect(src).not.toContain("/admin/community/promotions");
  });
});

describe("마이그레이션 · 롤백 시험 SQL", () => {
  const sql = read("supabase/migrations/20271107220000_admin_ads_ledger.sql");
  it("service_role 만 · 삭제 제외 기본 · 신청↔캠페인 한 행 · 기간 만료", () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_ads_ledger_page\([^)]*\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.admin_ads_ledger_rows\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toContain("WHERE coalesce(p_include_deleted, false) OR NOT u.deleted");
    expect(sql).toContain("NOT (c.request_id IS NOT NULL AND EXISTS");
    expect(sql).toContain("NOT (r.admin_campaign_id IS NOT NULL");
    expect(sql).toContain("'expired'");
    expect(sql).toMatch(/롤백 SQL/);
  });
});

// ── 로더: 원장 RPC · 옛 함수 대체 · 새 종류 행 ──
const calls: Array<{ name: string; args: unknown }> = [];
let ledgerMissing = false;
const ledgerPayload = {
  ledger: true,
  total: 2,
  rows: [
    {
      family: "ptr",
      source_id: "55555555-5555-4555-8555-555555555555",
      item_id: "ptr:55555555-5555-4555-8555-555555555555",
      kind: "ptr",
      ledger_domain: "platform",
      domain: "popup",
      product: "ptr_reveal",
      source_kind: "admin_direct",
      ops: "ended",
      status_tab: "ended",
      at: "2026-10-01T00:00:00Z",
      location_key: "PTR",
      location_target: "TRADE",
      advertiser_type: "operator",
      pay_currency: "NONE",
      pay_status: "none",
      start_at: "2026-09-01T00:00:00Z",
      end_at: "2026-09-30T00:00:00Z",
      paused_by: "admin",
      title: "가을 띠",
      delete_kind: "ptr",
      ended_reason: "expired",
    },
    {
      family: "my_banner",
      source_id: "66666666-6666-4666-8666-666666666666",
      item_id: "my_banner:66666666-6666-4666-8666-666666666666",
      kind: "my_banner",
      ledger_domain: "mypage",
      domain: "my_banner",
      product: "my_banner",
      source_kind: "admin_direct",
      ops: "live",
      status_tab: "live",
      at: "2026-10-02T00:00:00Z",
      location_key: "MYPAGE_TOP",
      advertiser_type: "operator",
      pay_currency: "NONE",
      pay_status: "none",
      impressions: 10,
      clicks: 1,
      title: "마이 배너",
      delete_kind: "my_banner",
    },
  ],
  summary_counts: {},
  queue_counts: {},
  popup_surfaces: [],
  kind_counts: { ptr: 4, my_banner: 1 },
  location_counts: [{ location_key: "PTR", location_target: "TRADE", status_tab: "ended", n: 1 }],
};

function fakeSb() {
  return {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "admin_ads_ledger_page" && ledgerMissing) {
        return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.admin_ads_ledger_page" } });
      }
      if (name === "admin_ads_ledger_page") return Promise.resolve({ data: ledgerPayload, error: null });
      return Promise.resolve({ data: { total: 0, rows: [] }, error: null });
    },
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const op of ["select", "eq", "order", "limit", "range", "in"]) chain[op] = () => chain;
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(res);
      return chain;
    },
  };
}

vi.mock("@/lib/admin/ads-exposure/popup-runtime-display", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  computePopupWinnerOccupancy: vi.fn(async () => ({ winnerIds: new Set<string>(), occupants: [] })),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-operations-action-queue", () => ({
  listDeliveryAdAdminActionQueue: vi.fn(async () => ({ ok: true, items: [], total: 0 })),
}));
vi.mock("@/lib/stores/advertising/admin-delivery-ad-loader", () => ({
  loadAdminDeliveryAdCampaignsByIds: vi.fn(async () => ({ items: [] })),
  loadAdminDeliveryAdCampaignsByLifecycles: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/lib/ads/feed-ad-campaigns-db", () => ({ listFeedAdCampaignsByIdsForAdmin: vi.fn(async () => []) }));
vi.mock("@/lib/platform-popup/admin-campaign-loader", () => ({
  listPlatformPopupAdminCampaignsByIds: vi.fn(async () => ({ ok: true, items: [] })),
}));

describe("로더 — 원장 함수 결과로", () => {
  beforeEach(() => {
    calls.length = 0;
    ledgerMissing = false;
  });
  it("원장 RPC 한 번 · 거름 인자 · 새 종류(PTR·마이 배너) 행을 원장 칸으로 그린다", async () => {
    const { loadAdsControlPlane } = await import("@/lib/admin/ads-control-plane/load-ads-control-plane");
    const model = await loadAdsControlPlane(fakeSb() as never, {
      page: { domain: "platform", kind: "ptr", location: "PTR|TRADE", advertiser: null, includeDeleted: false },
    });
    expect(calls.find((c) => c.name === "admin_ads_ledger_page")?.args).toMatchObject({
      p_domain: "platform",
      p_kind: "ptr",
      p_location: "PTR|TRADE",
      p_include_deleted: false,
    });
    expect(calls.some((c) => c.name === "admin_ads_workspace_page")).toBe(false);
    const [ptr, my] = model.applications;
    expect(ptr).toMatchObject({
      id: "ptr:55555555-5555-4555-8555-555555555555",
      href: "/admin/ptr-reveal-ads/55555555-5555-4555-8555-555555555555",
      status: "종료(기간 만료)",
      runtimeDisplayStatus: "ended",
      source: "platform_popup_campaigns",
    });
    expect(ptr?.ledger?.kind).toBe("ptr");
    expect(my).toMatchObject({ href: "/admin/my/banners/66666666-6666-4666-8666-666666666666/edit", performanceLabel: "노출 10 · 클릭 1" });
    expect(model.page?.ledger).toBe(true);
    expect(model.kindCounts).toEqual({ ptr: 4, my_banner: 1 });
    expect(model.locationCounts?.[0]).toMatchObject({ locationKey: "PTR", locationTarget: "TRADE", n: 1 });
  });
  it("원장 함수가 운영 DB 에 아직 없으면 옛 함수로 읽는다 (옛 도메인만 · deleted 탭 없음)", async () => {
    ledgerMissing = true;
    const { loadAdsControlPlane } = await import("@/lib/admin/ads-control-plane/load-ads-control-plane");
    const model = await loadAdsControlPlane(fakeSb() as never, { page: { domain: "platform", status: "deleted" } });
    const old = calls.find((c) => c.name === "admin_ads_workspace_page");
    expect(old?.args).toMatchObject({ p_domain: null, p_status: null });
    expect(model.page?.ledger).toBe(false);
    expect(model.sectionErrors).toContain("ledger_rpc_missing");
  });
});
