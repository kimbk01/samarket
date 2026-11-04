/**
 * 광고 ② 수정 구현 F (Owner 「설계안대로 구현」 2026-11-04) — 피드 배너 lib·API 동작 시험.
 * FB-C17 · PV-3 · DS-2 · DS-3 · DS-4 · FB-A10 · FB-A11 · D-5 · D-6 · FB-M11 · D-7 · D-8
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeFakeSb, type Row } from "@/lib/ads/__tests__/helpers/fake-supabase-1104f";

const sbRef = vi.hoisted(() => ({ current: null as unknown }));
const authRef = vi.hoisted(() => ({ userId: "u1" as string | null }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => sbRef.current }));
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: async () => (authRef.userId ? { ok: true, userId: authRef.userId } : { ok: false }),
}));
vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true })),
  creditUserPoints: vi.fn(async () => ({ ok: true })),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

import { spendUserPoints } from "@/lib/points/user-point-ledger";
import {
  feedAdAdvertiserDisplayName,
  feedAdCampaignAdvertiserName,
  normalizeFeedAdCampaignNameInput,
} from "@/lib/ads/feed-ad-advertiser-name";
import { listEligibleFeedAdCampaigns } from "@/lib/ads/feed-ad-campaigns-db";
import { GET as activeGET } from "@/app/api/feed-ads/active/route";
import { FEED_AD_PUBLIC_FORBIDDEN_KEYS } from "@/lib/ads/feed-ad-public-projection";
import { resolveFeedAdStoreDestination, withFeedAdStoreSlug } from "@/lib/ads/feed-ad-store-destination";
import { adminCompensateExtendFeedAdCampaign } from "@/lib/ads/admin-compensate-extend-feed-ad-campaign";
import { applyFeedAdCampaignPatch, planFeedAdCampaignPatch } from "@/lib/ads/update-feed-ad-campaign";
import { countFeedAdPoolOccupancy, feedAdPoolKey } from "@/lib/ads/feed-ad-pool-capacity";
import { loadFeedAdPoolRemaining } from "@/lib/ads/feed-ad-pool-capacity-server";
import { projectFeedPoolInventories } from "@/lib/admin/ads-exposure/placement-inventory";
import type { FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";
import { adminEndFeedAd, adminPauseFeedAd, adminResumeFeedAd } from "@/lib/ads/admin-feed-ad-lifecycle";
import { GET as meGET, POST as mePOST } from "@/app/api/me/feed-ad-requests/route";

const NOW = Date.now();
const future = new Date(NOW + 5 * 86_400_000).toISOString();
const past = new Date(NOW - 86_400_000).toISOString();
const UUID_POST = "3e2d5995-f0a5-425e-bed8-13426eca634c";
const UUID_EVENT = "11111111-2222-3333-4444-555555555555";
const UUID_STORE = "99999999-8888-7777-6666-555555555555";

function camp(id: string, over: Row = {}): Row {
  return {
    id,
    name: "",
    domain: "trade",
    placement: "TRADE_HOME",
    status: "active",
    priority: 100,
    start_at: past,
    end_at: future,
    destination_type: "internal_page",
    destination_id: "",
    destination_url: "/market",
    source: "ADMIN_DIRECT",
    request_id: null,
    ...over,
  };
}
const creative = (campaign_id: string, over: Row = {}): Row => ({
  id: `cr-${campaign_id}`,
  campaign_id,
  sort_order: 1,
  image_url: "https://cdn.example.com/a.png",
  headline: "",
  is_active: true,
  ...over,
});

describe("FB-C17 광고주 이름", () => {
  it("빈 값·「Untitled」·회원 코드 이름은 「광고」만 (빈 이름) · 저장은 빈 값", () => {
    expect(feedAdAdvertiserDisplayName("Untitled")).toBe("");
    expect(feedAdAdvertiserDisplayName("untitled")).toBe("");
    expect(feedAdAdvertiserDisplayName(null)).toBe("");
    expect(feedAdAdvertiserDisplayName("Event banner · Untitled")).toBe("");
    expect(feedAdAdvertiserDisplayName("디베이 마켓")).toBe("디베이 마켓");
    expect(normalizeFeedAdCampaignNameInput("  ")).toBe("");
    expect(normalizeFeedAdCampaignNameInput("Untitled")).toBe("");
    expect(planFeedAdCampaignPatch({ status: "active", source: "ADMIN_DIRECT" }, { name: "" })).toMatchObject({
      ok: true,
      campaign: { name: "" },
    });
  });

  it("회원 광고는 보는 시점 닉네임 — 승인 때 저장한 이름이 아니다 · 닉네임을 바꾸면 다음 조회부터 바뀐다", async () => {
    expect(feedAdCampaignAdvertiserName({ name: "옛닉", source: "MEMBER_REQUESTED", memberNickname: "새닉" })).toBe("새닉");
    const fake = makeFakeSb({
      feed_ad_campaigns: [camp("c-m", { source: "MEMBER_REQUESTED", request_id: "r-1", name: "옛닉" })],
      feed_ad_creatives: [creative("c-m")],
      feed_ad_requests: [{ id: "r-1", user_id: "user-9" }],
      profiles: [{ id: "user-9", nickname: "철수" }],
    });
    const a = await listEligibleFeedAdCampaigns(fake.sb, "trade");
    expect(feedAdCampaignAdvertiserName(a[0]!)).toBe("철수");
    fake.tables.profiles![0]!.nickname = "영희";
    const b = await listEligibleFeedAdCampaigns(fake.sb, "trade");
    expect(feedAdCampaignAdvertiserName(b[0]!)).toBe("영희");
  });
});

describe("PV-3 공개 응답 · DS-3 · DS-4 노출 단계 대상 확인", () => {
  function seed() {
    return makeFakeSb({
      feed_ad_campaigns: [
        camp("c-ok", { name: "좋은 매장" }),
        camp("c-none", { destination_url: "" }),
        camp("c-deleted-post", { destination_type: "community_post", destination_id: UUID_POST, destination_url: "" }),
        camp("c-ended-event", { destination_url: `/events/${UUID_EVENT}` }),
        camp("c-expired", { end_at: past }),
        camp("c-private-store", { destination_type: "store", destination_id: "closed-shop", destination_url: "" }),
      ],
      feed_ad_creatives: ["c-ok", "c-none", "c-deleted-post", "c-ended-event", "c-expired", "c-private-store"].map((c) => creative(c)),
      community_posts: [{ id: UUID_POST, status: "deleted", is_hidden: false, is_deleted: true }],
      platform_events: [{ id: UUID_EVENT, status: "published", starts_at: past, ends_at: new Date(NOW - 3_600_000).toISOString() }],
      stores: [{ slug: "closed-shop", approval_status: "approved", is_visible: false }],
    });
  }

  it("서버가 기간 안 · 목적지 있음 · 대상 공개인 것만 보낸다 (없음·삭제 글·끝난 이벤트·비공개 매장·기간 끝 제외)", async () => {
    const fake = seed();
    sbRef.current = fake.sb;
    const res = await activeGET(new NextRequest("http://x/api/feed-ads/active?domain=trade&placement=TRADE_HOME&pool=1"));
    const j = (await res.json()) as { campaigns: Row[]; validUntil: string | null };
    expect(j.campaigns.map((c) => c.id)).toEqual(["c-ok"]);
    expect(j.campaigns[0]!.advertiserName).toBe("좋은 매장");
    expect(j.validUntil).toBe(future);
  });

  it("응답 금지 키 0 — 기간·우선순위·출처·신청 id·상태·원래 이름 (풀·자리 응답 모두)", async () => {
    sbRef.current = seed().sb;
    for (const qs of ["pool=1", "slotOrdinal=0"]) {
      const res = await activeGET(new NextRequest(`http://x/api/feed-ads/active?domain=trade&placement=TRADE_HOME&${qs}`));
      const j = (await res.json()) as { campaigns: Row[]; campaign: Row | null };
      for (const c of [...j.campaigns, ...(j.campaign ? [j.campaign] : [])]) {
        for (const k of FEED_AD_PUBLIC_FORBIDDEN_KEYS) expect(Object.keys(c), `${qs}:${k}`).not.toContain(k);
        expect(Object.keys(c).sort()).toEqual(
          ["advertiserName", "destinationId", "destinationType", "destinationUrl", "id", "placement", "slides"].sort()
        );
      }
    }
  });
});

describe("DS-2 매장 목적지 = slug", () => {
  it("uuid → slug · slug 그대로 · 없는 매장 거부", async () => {
    const fake = makeFakeSb({ stores: [{ id: UUID_STORE, slug: "mandu-house" }] });
    expect(await resolveFeedAdStoreDestination(fake.sb, UUID_STORE)).toEqual({ ok: true, slug: "mandu-house" });
    expect(await resolveFeedAdStoreDestination(fake.sb, "mandu-house")).toEqual({ ok: true, slug: "mandu-house" });
    expect(await resolveFeedAdStoreDestination(fake.sb, "nope")).toEqual({ ok: false, error: "store_not_found" });
    expect(await withFeedAdStoreSlug(fake.sb, { destination_type: "store", destination_id: UUID_STORE })).toEqual({
      ok: true,
      row: { destination_type: "store", destination_id: "mandu-house" },
    });
  });
  it("수정 저장도 slug 로 바꿔 저장한다", async () => {
    const fake = makeFakeSb({ stores: [{ id: UUID_STORE, slug: "mandu-house" }], feed_ad_campaigns: [camp("c1")] });
    const plan = planFeedAdCampaignPatch({ status: "active", source: "ADMIN_DIRECT" }, { destinationType: "store", destinationId: UUID_STORE });
    if (!plan.ok) throw new Error(plan.error);
    expect(await applyFeedAdCampaignPatch(fake.sb, "c1", "active", plan)).toEqual({ ok: true });
    expect(fake.tables.feed_ad_campaigns![0]).toMatchObject({ destination_type: "store", destination_id: "mandu-house" });
  });
  it("DS-3: 수정에서 목적지를 비우면 거부", () => {
    expect(planFeedAdCampaignPatch({ status: "active", source: "ADMIN_DIRECT" }, { destinationType: "none" })).toMatchObject({
      ok: false,
      error: "destination_required",
      status: 400,
    });
  });
});

describe("FB-A10 자리 없음 트리거 → 409 + 한국어", () => {
  const capFail = (t: string, p: Row) => (t === "feed_ad_campaigns" && ("end_at" in p || "status" in p) ? "feed_ad_pool_capacity_full" : null);
  it("보상 연장", async () => {
    const fake = makeFakeSb({ feed_ad_campaigns: [camp("c1", { status: "paused" })] }, { failUpdate: capFail });
    const r = await adminCompensateExtendFeedAdCampaign(fake.sb, { adminUserId: "a1", campaignId: "c1", requestedDays: 3, reason: "보상" });
    expect(r).toEqual({ ok: false, error: "capacity_full", httpStatus: 409, message: "자리가 없어 처리하지 못했습니다." });
  });
  it("수정", async () => {
    const fake = makeFakeSb({ feed_ad_campaigns: [camp("c1")] }, { failUpdate: capFail });
    const plan = planFeedAdCampaignPatch({ status: "active", source: "ADMIN_DIRECT" }, { endAt: future });
    if (!plan.ok) throw new Error(plan.error);
    expect(await applyFeedAdCampaignPatch(fake.sb, "c1", "active", plan)).toEqual({
      ok: false,
      error: "capacity_full",
      status: 409,
      message: "자리가 없어 처리하지 못했습니다.",
    });
  });
});

describe("FB-A11 · D-7 같은 입력에서 세 곳(위치 지도 · 등록 화면 · 서버 검사)의 숫자가 같다", () => {
  const rows: FeedAdCampaignView[] = [
    ["a", "cat-1", "active"],
    ["b", "cat-1", "active"],
    ["c", "cat-1", "paused"],
    ["d", "cat-2", "active"],
    ["e", "cat-2", "draft"],
  ].map(([id, cat, status]): FeedAdCampaignView => ({
    id: id!,
    name: "",
    domain: "trade",
    placement: "TRADE_CATEGORY",
    targetCategoryId: cat!,
    targetTopicSlug: null,
    status: status as FeedAdCampaignView["status"],
    priority: 100,
    startAt: past,
    endAt: future,
    destinationType: "internal_page",
    destinationId: "",
    destinationUrl: "/market",
    slides: [],
  }));

  it("업종별: cat-1 = 3/3(가득) · cat-2 = 1/3", async () => {
    const counts = countFeedAdPoolOccupancy(rows);
    const map = projectFeedPoolInventories(rows).find((p) => p.placementKey === "TRADE_CATEGORY")!;
    const fake = makeFakeSb({
      feed_ad_campaigns: rows.map((r) => ({
        id: r.id,
        placement: r.placement,
        status: r.status,
        end_at: r.endAt,
        target_category_id: r.targetCategoryId,
        target_topic_slug: null,
      })),
    });
    for (const [cat, used] of [["cat-1", 3], ["cat-2", 1]] as const) {
      const key = feedAdPoolKey("TRADE_CATEGORY", { targetCategoryId: cat });
      const server = await loadFeedAdPoolRemaining(fake.sb, "TRADE_CATEGORY", { targetCategoryId: cat });
      const mapRow = map.targetPools.find((t) => t.targetKey === cat)!;
      expect(counts.get(key)).toBe(used); // 등록 화면이 쓰는 함수
      expect(mapRow.used).toBe(used); // 위치 지도
      expect(server).toMatchObject({ ok: true, used, capacity: 3, remaining: 3 - used }); // 서버(신청·승인)
    }
    expect(map.targetPools.find((t) => t.targetKey === "cat-1")!.status).toBe("full");
    expect(map.used).toBe(4);
    expect(map.capacity).toBe(6);
  });
});

describe("D-5 · D-6 · FB-M11 관리자 정지·재개·종료 lib", () => {
  it("DB 함수 이름·인자 그대로 · 결과 그대로 · 오류는 한국어", async () => {
    const fake = makeFakeSb({}, {
      rpc: (fn) =>
        fn === "admin_feed_ad_pause"
          ? { ok: true, status: "paused" }
          : fn === "admin_feed_ad_resume"
            ? { ok: true, status: "active", end_at: future, extended_seconds: 7200 }
            : { ok: false, error: "already_ended" },
    });
    const p = await adminPauseFeedAd(fake.sb, { campaignId: "c1", adminUserId: "a1", publicReason: " 이미지 확인 중 ", internalReason: "신고 3건" });
    expect(p).toEqual({ ok: true, status: "paused" });
    expect(fake.rpcCalls[0]).toEqual({
      fn: "admin_feed_ad_pause",
      args: { p_campaign_id: "c1", p_admin_id: "a1", p_public_reason: "이미지 확인 중", p_internal_reason: "신고 3건" },
    });
    expect(await adminResumeFeedAd(fake.sb, { campaignId: "c1", adminUserId: "a1" })).toMatchObject({ ok: true, extended_seconds: 7200 });
    const e = await adminEndFeedAd(fake.sb, { campaignId: "c1", adminUserId: "a1", fault: "operator", preview: true });
    expect(e).toMatchObject({ ok: false, error: "already_ended", message: "이미 종료된 배너입니다." });
    expect(fake.rpcCalls[2]!.args).toMatchObject({ p_fault: "operator", p_preview: true });
    expect(await adminEndFeedAd(fake.sb, { campaignId: "c1", adminUserId: "a1", fault: "" })).toMatchObject({
      ok: false,
      error: "fault_required",
      message: "귀책(운영·회원·없음)을 골라 주세요.",
    });
    expect(fake.rpcCalls).toHaveLength(3);
    expect(await adminPauseFeedAd(fake.sb, { campaignId: "c1", adminUserId: "a1", publicReason: "가".repeat(121) })).toMatchObject({
      ok: false,
      error: "public_reason_too_long",
    });
  });
});

describe("회원 API — D-6 공개 사유만 · 내부 메모 0 · D-7 자리 · D-8 종료 뒤 신청", () => {
  beforeEach(() => {
    authRef.userId = "u1";
    vi.mocked(spendUserPoints).mockClear();
  });
  const product = { id: "feed_banner_trade_7", domain: "trade", duration_days: 7, point_cost: 15000, is_active: true, title_ko: "7일", title_en: "7d", sort_order: 1 };

  it("GET: 「운영자가 멈췄습니다」 판정은 paused_by · 공개 사유 1줄 · 내부 메모(admin_memo·보상 메모)는 응답에 없다", async () => {
    const fake = makeFakeSb({
      feed_ad_products: [product],
      feed_ad_requests: [
        { id: "r1", user_id: "u1", status: "active", domain: "trade", placement: "TRADE_HOME", campaign_id: "c1", created_at: past, review_reason: "admin_extend_compensation:내부 비밀 메모" },
        { id: "r2", user_id: "u1", status: "active", domain: "trade", placement: "TRADE_HOME", campaign_id: "c2", created_at: past, review_reason: null },
      ],
      feed_ad_campaigns: [
        camp("c1", { status: "paused", paused_by: "admin", public_reason: "이미지 확인 중입니다", admin_memo: "내부 비밀 메모" }),
        camp("c2", { status: "paused", paused_by: "system", public_reason: null }),
      ],
    });
    sbRef.current = fake.sb;
    const res = await meGET(new NextRequest("http://x/api/me/feed-ad-requests"));
    const body = await res.text();
    expect(body).not.toContain("내부 비밀 메모");
    const j = JSON.parse(body) as { requests: Row[] };
    const r1 = j.requests.find((r) => r.id === "r1")!;
    const r2 = j.requests.find((r) => r.id === "r2")!;
    expect(r1.operatorNotice).toEqual({ kind: "admin_paused", publicReason: "이미지 확인 중입니다" });
    expect(r1.renewBlockedByAdmin).toBe("admin_paused");
    expect(r1.reviewReason).toBeNull();
    // 관리자 정지가 아닌 정지는 「운영자가 멈췄습니다」로 보이지 않는다 (추정 제거)
    expect(r2.operatorNotice).toBeNull();
    expect(r2.renewBlockedByAdmin).toBeNull();
  });

  it("GET ?pool= 남은 자리 안내 = 서버 검사와 같은 수", async () => {
    sbRef.current = makeFakeSb({
      feed_ad_products: [product],
      feed_ad_campaigns: [camp("a"), camp("b"), camp("c", { status: "ended" })],
    }).sb;
    const res = await meGET(new NextRequest("http://x/api/me/feed-ad-requests?pool=TRADE_HOME"));
    expect(await res.json()).toMatchObject({ ok: true, pool: { used: 2, capacity: 3, remaining: 1 } });
  });

  const postBody = {
    productId: "feed_banner_trade_7",
    placement: "TRADE_HOME",
    destinationType: "internal_page",
    destinationUrl: "/market",
    creatives: [{ imageUrl: "https://cdn.example.com/a.png" }],
  };
  const post = (b: Row = postBody) =>
    mePOST(new NextRequest("http://x/api/me/feed-ad-requests", { method: "POST", body: JSON.stringify(b) }));

  it("POST: 자리가 가득이면 409 capacity_full · 신청 행 0 · 보류(차감) 0", async () => {
    const fake = makeFakeSb({ feed_ad_products: [product], feed_ad_campaigns: [camp("a"), camp("b"), camp("c")] });
    sbRef.current = fake.sb;
    const res = await post();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "capacity_full" });
    expect(fake.tables.feed_ad_requests ?? []).toHaveLength(0);
    expect(spendUserPoints).not.toHaveBeenCalled();
  });

  it("POST DS-3: 목적지 없음 → 400 destination_required · 보류 0", async () => {
    const fake = makeFakeSb({ feed_ad_products: [product] });
    sbRef.current = fake.sb;
    const res = await post({ ...postBody, destinationType: "none", destinationUrl: "" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "destination_required" });
    expect(spendUserPoints).not.toHaveBeenCalled();
  });

  it("POST D-8: 관리자가 종료한 광고(신청 행은 active 로 남음) 뒤 새 신청 허용 · 진행 중이면 그대로 막음(FB-M01)", async () => {
    const ended = makeFakeSb({
      feed_ad_products: [product],
      feed_ad_requests: [{ id: "old", user_id: "u1", status: "active", campaign_id: "c-old", start_at: past, end_at: future, created_at: past }],
      feed_ad_campaigns: [camp("c-old", { status: "ended", source: "MEMBER_REQUESTED", request_id: "old" })],
    });
    sbRef.current = ended.sb;
    const ok = await post();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, status: "pending_review" });

    const running = makeFakeSb({
      feed_ad_products: [product],
      feed_ad_requests: [{ id: "old", user_id: "u1", status: "active", campaign_id: "c-old", start_at: past, end_at: future, created_at: past }],
      feed_ad_campaigns: [camp("c-old", { status: "paused", paused_by: "admin", source: "MEMBER_REQUESTED", request_id: "old" })],
    });
    sbRef.current = running.sb;
    const blocked = await post();
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ error: "current_banner_exists" });
  });
});
