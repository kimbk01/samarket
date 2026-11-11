// @vitest-environment jsdom
/**
 * 광고 수정 설계 2026-11-04 — AD-129·AD-308(이력 상세 단건 주소·권한 없으면 숨김) ·
 * AD-301·AD-302·AD-303(한국어 화면에 영어 코드 0) · AL-12(운영자 등록 피드 배너 = 결제 없음) · D-20(만들기 화면 첫 상태).
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 쓰는 코드를 실행한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams("");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/advertising/history",
  useSearchParams: () => searchParams,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));
vi.mock("@/components/admin/AdminShellContext", () => ({
  useAdminShell: () => ({ adminMe: null, adminMeLoading: false }),
}));
vi.mock("@/lib/ads/feed-ad-products", () => ({ listFeedAdProducts: vi.fn(async () => []) }));
vi.mock("@/lib/points/member-promotion-products-server", () => ({
  loadMemberPromotionProducts: vi.fn(async () => []),
}));
vi.mock("@/lib/stores/advertising/delivery-ad-commercial-catalog", () => ({
  loadDeliveryAdCommercialCatalog: vi.fn(async () => ({ packages: [] })),
}));

import {
  ADS_HISTORY_DETAIL_HREF,
  projectBoostHistoryRow,
  projectDeliveryHistoryRow,
  projectFeedBannerHistoryRow,
  projectPopupAdminHistoryRow,
  projectPopupOwnerLegacyHistoryRow,
} from "@/lib/admin/ads-history/project-history-timeline";
import type { AdsHistoryLedgerRow } from "@/lib/admin/ads-history/types";
import {
  RowDetail,
  historyDetailHrefForActor,
} from "@/components/admin/ads/AdminAdsHistoryLedgerView";
import {
  projectFeedCampaignToActionItem,
  projectFeedCampaignToExecutionRow,
} from "@/lib/admin/ads-control-plane/project-family-rows";
import { loadAdsCommercialControlModel } from "@/lib/admin/ads-commercial/products-control-model";
import {
  AdminAdsDirectRegisterHub,
  orderAdminAdsDirectProducts,
  resolveAdminAdsDirectRegisterDomain,
} from "@/components/admin/ads/AdminAdsDirectRegisterHub";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = "11111111-1111-4111-8111-111111111111";
const ADMIN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function feedRequestRow(): AdsHistoryLedgerRow {
  return projectFeedBannerHistoryRow({
    id: ID,
    domain: "trade",
    kind: "request",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    startAt: null,
    endAt: null,
    title: "회원 배너",
    placement: "TRADE_HOME",
    source: "request",
    userId: "user-1234567890",
    createdBy: null,
    pointCost: 500,
    reviewedBy: ADMIN,
    reviewedAt: "2026-10-02T00:00:00.000Z",
    reviewReason: null,
  });
}

function feedCampaignRow(): AdsHistoryLedgerRow {
  return projectFeedBannerHistoryRow({
    id: ID,
    domain: "community",
    kind: "campaign",
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
    startAt: "2026-10-01T00:00:00.000Z",
    endAt: null,
    title: "운영자 배너",
    placement: "COMMUNITY_HOME",
    source: "ADMIN_DIRECT",
    userId: null,
    createdBy: ADMIN,
    pointCost: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewReason: null,
  });
}

function popupAdminRow(ownerRequestId: string | null = null): AdsHistoryLedgerRow {
  return projectPopupAdminHistoryRow({
    id: ID,
    name: "팝업",
    status: "active",
    approvalStatus: "approved",
    createdAt: "2026-10-01T00:00:00.000Z",
    createdBy: ADMIN,
    approvedBy: ADMIN,
    approvedAt: "2026-10-01T01:00:00.000Z",
    startAt: null,
    endAt: "2026-10-05T00:00:00.000Z",
    ownerRequestId,
  });
}

function popupOwnerRow(): AdsHistoryLedgerRow {
  return projectPopupOwnerLegacyHistoryRow({
    id: ID,
    title: "나의 매장",
    requestStatus: "rejected",
    createdAt: "2026-10-01T00:00:00.000Z",
    ownerUserId: ADMIN,
    storeId: "s1",
    priceMinor: 10000,
    currency: "PHP",
    paymentStatus: "refunded",
  });
}

function deliveryRow(adminDirect: boolean): AdsHistoryLedgerRow {
  return projectDeliveryHistoryRow({
    id: ID,
    product: "banner",
    title: "배달 배너",
    campaignSource: adminDirect ? "DIBAY_FIRST_PARTY" : "OWNER_PAID",
    ownerUserId: adminDirect ? null : ADMIN,
    lifecycleStatus: "ACTIVE",
    reviewStatus: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    submittedAt: null,
    startAt: null,
    endAt: null,
    inventoryKeys: ["STORES_HOME_HERO"],
    sortOrder: 0,
    finalPayableMinor: adminDirect ? null : 5000,
    currency: "PHP",
    audits: [
      { action: "approve", actorType: "admin", actorUserId: ADMIN, reason: null, createdAt: "2026-10-01T02:00:00.000Z" },
      { action: "custom_code_x", actorType: "owner", actorUserId: ADMIN, reason: null, createdAt: "2026-10-01T03:00:00.000Z" },
    ],
    refundProven: true,
    refundAmountLabel: "10 PHP",
    impressionCount: 3,
  });
}

function boostRow(): AdsHistoryLedgerRow {
  return projectBoostHistoryRow({
    id: ID,
    domain: "community",
    orderStatus: "paused",
    createdAt: "2026-10-01T00:00:00.000Z",
    endAt: null,
    startAt: null,
    targetTitle: "글",
    userId: "user-1234567890",
    pointCost: 300,
  });
}

/** 한국어 화면에 보이는 모든 문자열 (labelKo·…Ko·행위자·신청자·금액) */
function koTexts(row: AdsHistoryLedgerRow): string[] {
  return [
    row.productLabelKo,
    row.sourceLabelKo,
    row.paymentStateLabelKo,
    row.lifecycleSummaryKo,
    row.placementLabelKo ?? "",
    row.applicantLabel ?? "",
    row.historicalAmountLabel ?? "",
    ...row.gapsKo,
    ...row.timeline.flatMap((e) => [e.labelKo, e.evidenceNoteKo ?? "", e.actorLabel ?? ""]),
  ];
}

const FORBIDDEN_KO = /Admin|Popup|mutation|Point|NOT_PROVEN|오너|legacy|audit|_minor|point_cost|feed_ad_requests|delivery_ad_/;

describe("AD-129 · AD-308 — 이력 상세 = 그 항목 하나", () => {
  it("피드 회원 신청 → 신청 상세", () => {
    expect(feedRequestRow().detailHref).toBe(`/admin/feed-ad-requests/${ID}`);
  });
  it("피드 운영자 등록 캠페인 → 캠페인 수정 화면 (단독 [campaignId] 페이지 없음)", () => {
    expect(feedCampaignRow().detailHref).toBe(`/admin/feed-ads/${ID}/edit`);
  });
  it("운영자 팝업 → 팝업 캠페인 상세 (사장님 신청 연결 캠페인도 캠페인 상세)", () => {
    expect(popupAdminRow().detailHref).toBe(`/admin/platform-popup/${ID}`);
    expect(popupAdminRow("req-1").detailHref).toBe(`/admin/platform-popup/${ID}`);
  });
  it("사장님 팝업(이전 방식) 신청 → 신청 상세 페이지", () => {
    expect(popupOwnerRow().detailHref).toBe(`/admin/platform-popup/requests/${ID}`);
    expect(ADS_HISTORY_DETAIL_HREF.popupOwnerRequest(ID)).toBe(`/admin/platform-popup/requests/${ID}`);
  });
  it("목록 주소(노출 관리·신청 목록)로 보내지 않는다", () => {
    for (const row of [feedRequestRow(), feedCampaignRow(), popupAdminRow(), popupOwnerRow()]) {
      expect(row.detailHref).not.toBe("/admin/advertising/operations");
      expect(row.detailHref).not.toBe("/admin/advertising/applications");
    }
  });
});

describe("AD-129 — 권한이 없으면 상세 링크 숨김 (화면 렌더)", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("관리자면 상세 링크가 그 항목 주소로 보인다", () => {
    const row = feedRequestRow();
    act(() => root.render(<RowDetail row={row} ko actor={{ role: "admin", permissions: [] }} />));
    const link = host.querySelector('[data-ads-history-detail-link="1"]');
    expect(link?.getAttribute("href")).toBe(`/admin/feed-ad-requests/${ID}`);
  });

  it("관리자 권한이 없는 계정이면 상세 링크가 없다", () => {
    const row = feedRequestRow();
    act(() => root.render(<RowDetail row={row} ko actor={{ role: "user", permissions: [] }} />));
    expect(host.querySelector('[data-ads-history-detail-link="1"]')).toBeNull();
    expect(historyDetailHrefForActor(row.detailHref, { role: "user", permissions: [] })).toBeNull();
  });

  it("한국어 상세 펼침에 영어 코드·「mutation」이 없고 「바뀐 내용이 없습니다」를 보인다", () => {
    for (const row of [feedCampaignRow(), popupOwnerRow(), deliveryRow(true)]) {
      act(() => root.render(<RowDetail row={row} ko actor={{ role: "super_admin", permissions: [] }} />));
      const text = host.textContent ?? "";
      expect(text).toContain("바뀐 내용이 없습니다");
      expect(text).not.toMatch(/mutation|NOT_PROVEN|Admin|Popup|Point/);
    }
  });
});

describe("AD-301 · AD-302 — 한국어 라벨에 영어 코드 0", () => {
  it("모든 이력 투영의 한국어 문자열에 Admin·Popup·mutation·Point·오너 등이 없다", () => {
    const rows = [
      boostRow(),
      feedRequestRow(),
      feedCampaignRow(),
      deliveryRow(true),
      deliveryRow(false),
      popupAdminRow(),
      popupAdminRow("req-1"),
      popupOwnerRow(),
    ];
    for (const row of rows) {
      for (const t of koTexts(row)) {
        expect(t, `${row.id}: ${t}`).not.toMatch(FORBIDDEN_KO);
      }
    }
  });

  it("새 정본 문구", () => {
    expect(feedCampaignRow().sourceLabelKo).toBe("운영자 등록");
    expect(deliveryRow(false).sourceLabelKo).toBe("사장님 신청");
    expect(popupOwnerRow().sourceLabelKo).toBe("사장님 신청(이전 방식)");
    expect(popupOwnerRow().placementLabelKo).toBe("사장님 팝업(이전 방식)");
    expect(feedCampaignRow().timeline[0]?.actorLabel).toBe(`운영자 ${ADMIN.slice(0, 8)}`);
    expect(deliveryRow(false).timeline[0]?.actorLabel).toBe(`사장님 ${ADMIN.slice(0, 8)}`);
    expect(feedRequestRow().lifecycleSummaryKo).toContain("포인트");
    expect(boostRow().historicalAmountLabel).toBe("300 포인트");
    // 영어 화면은 영어 유지
    expect(feedCampaignRow().sourceLabelEn).toBe("Admin direct");
    expect(popupOwnerRow().placementLabelEn).toBe("Popup (legacy owner)");
  });
});

describe("AD-303 — 상품 화면 한국어", () => {
  it("팝업 판매 상태·결제 요약 = 「운영자 전용」, 한국어 칸에 Admin·Point 없음", async () => {
    const model = await loadAdsCommercialControlModel({} as never);
    const popup = model.products.find((p) => p.productKey === "popup");
    expect(popup?.sellStateKo).toBe("운영자 전용");
    const json = JSON.stringify(model, (k, v) => (k.endsWith("En") || k === "key" ? undefined : v));
    const koValues = [...json.matchAll(/"[A-Za-z]*Ko":"([^"]*)"/g)].map((m) => m[1]);
    expect(koValues.length).toBeGreaterThan(10);
    for (const v of koValues) expect(v).not.toMatch(/Admin|Point|Popup|Owner|Legacy|writer|SKU|NOT_SELLABLE|오너/);
  });
});

describe("AL-12 — 운영자 등록·이벤트 배포 피드 배너 = 결제 없음", () => {
  const base = {
    id: ID,
    name: "x",
    domain: "trade",
    placement: "TRADE_HOME",
    targetCategoryId: null,
    targetTopicSlug: null,
    status: "active",
    priority: 100,
    startAt: null,
    endAt: null,
    destinationType: "internal_page",
    destinationId: "",
    destinationUrl: "",
    slides: [],
  } as unknown as FeedAdCampaignView;

  it("ADMIN_DIRECT → 「결제 없음」 · financeHref null · currency N_A", () => {
    const item = projectFeedCampaignToActionItem({ ...base, source: "ADMIN_DIRECT" });
    expect(item.paymentLabel).toBe("결제 없음");
    expect(item.financeHref).toBeNull();
    expect(item.currency).toBe("N_A");
    expect(projectFeedCampaignToExecutionRow({ ...base, source: "ADMIN_DIRECT" })?.currency).toBe("N_A");
  });

  it("회원 신청 캠페인(MEMBER_REQUESTED)은 포인트 결제 · 포인트 원장 링크 유지", () => {
    const item = projectFeedCampaignToActionItem({ ...base, source: "MEMBER_REQUESTED" });
    expect(item.paymentLabel).not.toBe("결제 없음");
    expect(item.financeHref).toBe("/admin/finance#point");
    expect(item.currency).toBe("POINT");
  });
});

describe("D-20 — 만들기 화면이 ?domain= 으로 도메인을 미리 고른다", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    searchParams = new URLSearchParams("");
  });

  it("값 해석 · 순서", () => {
    expect(resolveAdminAdsDirectRegisterDomain("trade")).toBe("trade");
    expect(resolveAdminAdsDirectRegisterDomain("DELIVERY")).toBe("delivery");
    expect(resolveAdminAdsDirectRegisterDomain("x")).toBeNull();
    expect(orderAdminAdsDirectProducts("delivery").map((p) => p.id)).toEqual([
      "delivery",
      "community",
      "trade",
      "popup",
    ]);
  });

  it("?domain=trade 로 열면 거래 배너가 맨 앞·선택 상태", () => {
    searchParams = new URLSearchParams("domain=trade");
    act(() => root.render(<AdminAdsDirectRegisterHub />));
    const cards = [...host.querySelectorAll("[data-admin-ads-direct-product]")];
    expect(cards.map((c) => c.getAttribute("data-admin-ads-direct-product"))).toEqual([
      "trade",
      "community",
      "delivery",
      "popup",
    ]);
    expect(cards[0]?.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector('[data-admin-ads-direct-selected="1"]')?.getAttribute("href")).toBe(
      "/admin/advertising/direct/trade"
    );
  });

  it("도메인 없이 열면 고르지 않는다 (원래 순서)", () => {
    act(() => root.render(<AdminAdsDirectRegisterHub />));
    expect(host.querySelector('[data-admin-ads-direct-selected="1"]')).toBeNull();
    expect(
      [...host.querySelectorAll("[data-admin-ads-direct-product]")].map((c) =>
        c.getAttribute("data-admin-ads-direct-product")
      )
    ).toEqual(["community", "trade", "delivery", "popup"]);
  });
});
