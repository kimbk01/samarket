/**
 * 재감사 2026-11-04 (Owner 「P0·P1 수정」) — 동작 시험 (실제 함수·라우트 실행, 문자열 검사 아님).
 * R-04 같은 키 재전송 = 가격 비교 전에 처음 결과 · F-01 보는 사람 = 서버 · N-02/N-03 거래 재개·정지 사유
 * Owner 결정 2 PTR 소재 버전.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const getProduct = vi.fn();
const priceMatches = vi.fn();
const readBalance = vi.fn();
const optionalUser = vi.fn();
const rpc = vi.fn();
const tables: Record<string, Record<string, unknown>[]> = {};

/** 아주 작은 PostgREST 흉내: from(t).select().eq(k,v)….limit().maybeSingle() */
function fakeFrom(table: string) {
  const filters: Array<[string, unknown]> = [];
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      filters.push([k, v]);
      return q;
    },
    limit: () => q,
    maybeSingle: async () => {
      const row = (tables[table] ?? []).find((r) => filters.every(([k, v]) => r[k] === v)) ?? null;
      return { data: row, error: null };
    },
  };
  return q;
}

vi.mock("@/lib/auth/api-session", () => ({ requireAuthenticatedUserId: () => auth() }));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: () => optionalUser(),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({ from: fakeFrom, rpc: (...a: unknown[]) => rpc(...a) }),
}));
vi.mock("@/lib/points/member-promotion-products-server", () => ({
  getMemberPromotionProductLive: (...a: unknown[]) => getProduct(...a),
  loadMemberPromotionProducts: vi.fn(),
  memberPromotionPriceMatches: (...a: unknown[]) => priceMatches(...a),
}));
vi.mock("@/lib/points/user-point-ledger", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readUserPointBalance: () => readBalance(),
}));

import { POST as purchase } from "@/app/api/me/points/promotion-orders/route";
import { POST as feedEvent } from "@/app/api/feed-ads/events/route";
import { adsWorkspaceActionKind, adsWorkspaceActionNeedsReason } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { ptrRevealCampaignRevision } from "@/lib/platform-popup/ptr-reveal-payload";

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  auth.mockResolvedValue({ ok: true, userId: "user-1" });
  getProduct.mockResolvedValue({
    id: "community_promote_7",
    domain: "community",
    durationDays: 7,
    pointCost: 25000,
    priceAsset: "D_POINT",
    requiresAdminApproval: false,
    revision: 4,
    source: "db",
    updatedAt: null,
  });
  readBalance.mockResolvedValue(5000);
});

function purchaseReq(key: string, body: Record<string, unknown>) {
  return purchase(
    new Request("https://x.test/api/me/points/promotion-orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    }) as never
  );
}

describe("R-04 — 같은 결제 키 재전송은 가격이 바뀌었어도 처음 결과 (추가 결제 없음)", () => {
  it("새 주문 키: 가격 비교·DB 결제 함수를 부르지 않고 idempotent 로 돌려준다", async () => {
    tables.point_promotion_orders = [
      { id: "order-1", user_id: "user-1", idempotency_key: "k-1", order_status: "active", end_at: "2026-11-11T00:00:00Z", product_id: "community_promote_7", point_cost: 20000, domain: "community" },
    ];
    priceMatches.mockReturnValue(false); // 그사이 가격이 20,000 → 25,000 으로 바뀜
    const res = await purchaseReq("k-1", { targetId: "post-1", productId: "community_promote_7", expectedPointCost: 20000, expectedDurationDays: 7 });
    expect(res.status).toBe(200);
    const j = (await res.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, idempotent: true, extended: false, pointCost: 20000, balanceAfter: 5000 });
    expect(rpc).not.toHaveBeenCalled();
    expect(priceMatches).not.toHaveBeenCalled();
  });

  it("연장 키(원장 promotion_extend): extended + idempotent", async () => {
    tables.point_ledger = [
      { user_id: "user-1", related_type: "promotion_order", entry_type: "promotion_extend", idempotency_key: "k-2", related_id: "order-9" },
    ];
    tables.point_promotion_orders = [{ id: "order-9", order_status: "active", end_at: "2026-11-20T00:00:00Z" }];
    priceMatches.mockReturnValue(false);
    const res = await purchaseReq("k-2", { targetId: "post-1", productId: "community_promote_7" });
    const j = (await res.json()) as Record<string, unknown>;
    expect(j).toMatchObject({ ok: true, idempotent: true, extended: true, endAt: "2026-11-20T00:00:00Z" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("남의 키는 재전송으로 보지 않는다 → 평소처럼 가격 비교(바뀌었으면 409, 결제 없음)", async () => {
    tables.point_promotion_orders = [{ id: "order-1", user_id: "someone-else", idempotency_key: "k-1" }];
    priceMatches.mockReturnValue(false);
    const res = await purchaseReq("k-1", { targetId: "post-1", productId: "community_promote_7" });
    expect(res.status).toBe(409);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("R-03 — 커뮤니티 결제 재전송 응답에 idempotent 가 실린다", () => {
  it("DB 가 idempotent 를 돌려주면 응답 idempotent=true (화면 「이미 처리된 결제예요」)", async () => {
    priceMatches.mockReturnValue(true);
    rpc.mockResolvedValue({
      data: { ok: true, idempotent: true, extended: true, order_id: "order-3", status: "active", end_at: "2026-11-20T00:00:00Z", point_cost: 25000, product_id: "community_promote_7" },
      error: null,
    });
    tables.community_posts = [{ id: "post-1", user_id: "user-1", title: "t", status: "active", is_hidden: false }];
    tables.profiles = [{ id: "user-1", nickname: "n" }];
    const res = await purchaseReq("k-new", { targetId: "post-1", productId: "community_promote_7", targetType: "community_post" });
    const j = (await res.json()) as Record<string, unknown>;
    if (res.status === 200) {
      expect(j).toMatchObject({ ok: true, idempotent: true, extended: true });
    } else {
      // 커뮤니티 글 소유 확인 등 앞단 조회가 이 흉내 DB 로 재현되지 않으면 여기로 온다 — 그때는 실패로 둔다
      throw new Error(`unexpected ${res.status} ${JSON.stringify(j)}`);
    }
  });
});

describe("F-01 — 피드 배너 노출·클릭: 보는 사람은 서버가 정한다", () => {
  const ev = (body: Record<string, unknown>, ip = "203.0.113.7") =>
    feedEvent(
      new Request("https://x.test/api/feed-ads/events", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": ip },
        body: JSON.stringify(body),
      }) as never
    );
  const base = { campaignId: "11111111-1111-4111-8111-111111111111", creativeId: "22222222-2222-4222-8222-222222222222", placement: "TRADE_HOME" };

  it("앱이 보낸 세션·자리 번호를 바꿔도 키 재료는 같다 (같은 사람 = 같은 값)", async () => {
    optionalUser.mockResolvedValue(null);
    rpc.mockResolvedValue({ data: { ok: true, deduped: false }, error: null });
    await ev({ ...base, eventType: "impression", feedSessionId: "s-1", slotOrdinal: 3 });
    await ev({ ...base, eventType: "impression", feedSessionId: "s-2", slotOrdinal: 9 });
    const [a, b] = rpc.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(a.p_session_id).toBe(b.p_session_id);
    expect(String(a.p_session_id)).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(String(a.p_session_id)).not.toContain("203.0.113.7");
    expect(a.p_slot_ordinal).toBe(0);
    expect(b.p_slot_ordinal).toBe(0);
  });

  it("로그인 = 회원 id 기준 · IP 를 모르는 비로그인은 기록하지 않는다", async () => {
    optionalUser.mockResolvedValue("user-7");
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await ev({ ...base, eventType: "impression", feedSessionId: "anything" });
    expect((rpc.mock.calls[0]![1] as Record<string, unknown>).p_session_id).toBe("u:user-7");
    optionalUser.mockResolvedValue(null);
    rpc.mockClear();
    const res = await feedEvent(
      new Request("https://x.test/api/feed-ads/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, eventType: "impression" }),
      }) as never
    );
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("클릭은 같은 사람의 노출을 먼저 기록한다 (클릭 수 ≤ 노출 수)", async () => {
    optionalUser.mockResolvedValue("user-7");
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    await ev({ ...base, eventType: "click" });
    expect(rpc.mock.calls.map((c) => (c[1] as Record<string, unknown>).p_event_type)).toEqual(["impression", "click"]);
  });
});

describe("N-02 · N-03 — 거래 상위노출 재개·일시정지는 어느 화면에서든 사유 필수 (운영 DB 가 사유 2자 요구)", () => {
  it("재개 = adResume(L2) · 정지 = pause(L2) — 설계 §6 (2026-11-04) 모든 광고 계열 같은 단계", () => {
    expect(adsWorkspaceActionKind("resume", "boost_trade")).toBe("adResume");
    // 설계 §6: 정지는 모든 광고 계열 같은 단계(pause L2 · 사유 필수)
    expect(adsWorkspaceActionKind("pause", "boost_trade")).toBe("pause");
    expect(adsWorkspaceActionNeedsReason("resume", "boost_trade")).toBe(true);
    expect(adsWorkspaceActionNeedsReason("pause", "boost_trade")).toBe(true);
    // 설계 §6 · FB-A05 (2026-11-04): 피드 배너 재개도 사유 필수
    expect(adsWorkspaceActionNeedsReason("resume", "feed_banner")).toBe(true);
  });
});

describe("Owner 결정 2 — PTR 「다시 보지 않기」 소재 버전 = 띠 3종", () => {
  it("태블릿 띠·로고만 바뀌어도 새 버전 · 없으면 null", () => {
    const a = ptrRevealCampaignRevision({ default: { id: "p1" }, tablet: { id: "t1" }, logo: null });
    expect(a).toBe("p1+t1+-");
    expect(ptrRevealCampaignRevision({ default: { id: "p1" }, tablet: { id: "t2" }, logo: null })).not.toBe(a);
    expect(ptrRevealCampaignRevision({ default: { id: "p1" }, tablet: { id: "t1" }, logo: { id: "l1" } })).not.toBe(a);
    expect(ptrRevealCampaignRevision({ tablet: { id: "t1" } })).toBeNull();
  });
});
