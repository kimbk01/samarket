/**
 * PHASE 3 — Delivery / eligibility / geometry / renewal contracts (D1–D14).
 * Runtime browser E2E remains FINAL — these are not Runtime PASS claims.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FEED_AD_SLOT_AFTER_CONTENT_COUNT,
  isFeedAdCampaignEligibleNow,
  selectCampaignForPlacement,
  shouldInjectFeedAdAfterContentIndex,
  type FeedAdCampaignView,
} from "@/lib/ads/feed-ad-placement";
import {
  FEED_AD_SLOT_GAP_MIN,
  FEED_AD_SLOT_GAP_MAX,
  planFeedAdSlots,
  shouldInjectFeedAdAtContentIndex,
} from "@/lib/ads/feed-ad-slot-policy";
import {
  computeFeedAdRenewalEndAt,
  projectFeedAdMemberPresentation,
} from "@/lib/ads/feed-ad-member-presentation";
import {
  feedAdMediaClass,
  getFeedAdCreativeSpec,
} from "@/lib/ads/feed-ad-geometry";
import { renewFeedAdCampaign } from "@/lib/ads/renew-feed-ad-campaign";
import { creditUserPoints, spendUserPoints } from "@/lib/points/user-point-ledger";

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true, balanceAfter: 100 })),
  creditUserPoints: vi.fn(async () => ({ ok: true, balanceAfter: 100 })),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

function slide(): FeedAdCampaignView["slides"][0] {
  return {
    id: "s1",
    sortOrder: 1,
    imageUrl: "https://cdn.example/a.jpg",
    altText: "",
    headline: "",
    description: "",
    ctaLabel: "",
    destinationType: null,
    destinationId: "",
    destinationUrl: "",
  };
}

function camp(partial: Partial<FeedAdCampaignView>): FeedAdCampaignView {
  return {
    id: "c1",
    name: "n",
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
    destinationUrl: "/",
    source: "MEMBER_REQUESTED",
    requestId: "req-1",
    slides: [slide()],
    ...partial,
  };
}

type Row = Record<string, unknown>;

function makeRenewDb(state: {
  campaigns: Row[];
  requests: Row[];
  ledger: Row[];
  failCampaignUpdate?: boolean;
  /** 재감사 F-04: 연장 UPDATE 오류 문구 (DB 트리거 `feed_ad_pool_capacity_full` 흉내) */
  failCampaignUpdateMessage?: string;
  products?: Row[];
  /** D-01: DB 함수 흉내용 — 잔액 · 자리 없음 · rpc 호출 기록 */
  balance?: number;
  capacityFull?: boolean;
  rpcCalls?: { fn: string; args: Row }[];
}) {
  const products: Row[] = state.products ?? [
    {
      id: "feed_banner_trade_7",
      domain: "trade",
      duration_days: 7,
      point_cost: 15000,
      title_ko: "거래 7일",
      title_en: "Trade 7d",
      sort_order: 20,
      is_active: true,
    },
    {
      id: "feed_banner_trade_3",
      domain: "trade",
      duration_days: 3,
      point_cost: 8000,
      title_ko: "거래 3일",
      title_en: "Trade 3d",
      sort_order: 10,
      is_active: true,
    },
  ];

  function matchEq(row: Row, filters: { col: string; val: unknown }[]) {
    return filters.every((f) => String(row[f.col]) === String(f.val));
  }

  function tableApi(table: string) {
    const filters: { col: string; val: unknown }[] = [];
    let payload: Row | null = null;
    let mode: "select" | "update" | "insert" = "select";
    let limitN: number | null = null;

    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      insert(row: Row) {
        mode = "insert";
        payload = row;
        return api;
      },
      update(row: Row) {
        mode = "update";
        payload = row;
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push({ col, val });
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      maybeSingle: async () => {
        if (table === "feed_ad_products") {
          const row = products.find((r) => matchEq(r, filters)) ?? null;
          return { data: row, error: null };
        }
        if (table === "feed_ad_campaigns") {
          if (mode === "update" && payload) {
            if (state.failCampaignUpdate) {
              return { data: null, error: { message: state.failCampaignUpdateMessage ?? "upd_fail" } };
            }
            const idx = state.campaigns.findIndex((r) => matchEq(r, filters));
            if (idx < 0) return { data: null, error: null };
            state.campaigns[idx] = { ...state.campaigns[idx], ...payload };
            return {
              data: { id: state.campaigns[idx].id, end_at: state.campaigns[idx].end_at },
              error: null,
            };
          }
          const row = state.campaigns.find((r) => matchEq(r, filters)) ?? null;
          return { data: row, error: null };
        }
        if (table === "feed_ad_requests") {
          if (mode === "update" && payload) {
            const idx = state.requests.findIndex((r) => matchEq(r, filters));
            if (idx >= 0) state.requests[idx] = { ...state.requests[idx], ...payload };
            return { data: { id: filters.find((f) => f.col === "id")?.val }, error: null };
          }
          const row = state.requests.find((r) => matchEq(r, filters)) ?? null;
          return { data: row, error: null };
        }
        if (table === "point_ledger") {
          const row = state.ledger.find((r) => matchEq(r, filters)) ?? null;
          return { data: row, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve: (v: unknown) => void) {
        if (table === "point_ledger") {
          if (mode === "insert" && payload) {
            state.ledger.push(payload);
            resolve({ data: null, error: null });
            return;
          }
          let rows = state.ledger.filter((r) => matchEq(r, filters));
          if (limitN != null) rows = rows.slice(0, limitN);
          resolve({ data: rows, error: null });
          return;
        }
        if (table === "feed_ad_requests" && mode === "update") {
          const idx = state.requests.findIndex((r) => matchEq(r, filters));
          if (idx >= 0 && payload) state.requests[idx] = { ...state.requests[idx], ...payload };
          resolve({ data: null, error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return api;
  }

  /**
   * `member_feed_ad_renew` 흉내 (D-01 계약): 한 트랜잭션 — 같은 키 원장이 있으면 지금 종료일만 돌려주고 연장하지 않음 ·
   * 가격 확인 · 잔액 부족/자리 없음이면 아무것도 바꾸지 않음.
   */
  function memberFeedAdRenew(args: Row) {
    const userId = String(args.p_user);
    const campaignId = String(args.p_campaign);
    const key = String(args.p_key);
    const c = state.campaigns.find((r) => r.id === campaignId);
    const req = c ? state.requests.find((r) => r.id === c.request_id) : undefined;
    if (!c || !req || String(req.user_id) !== userId || c.source !== "MEMBER_REQUESTED") {
      return { ok: false, error: "not_found" };
    }
    if (c.status === "paused" && c.paused_by === "admin") return { ok: false, error: "admin_paused" };
    if (c.status === "ended") return { ok: false, error: "admin_ended" };
    if (c.status !== "active") return { ok: false, error: "not_renewable" };
    const relatedId = `renew:${campaignId}:${key}`;
    if (state.ledger.some((l) => l.user_id === userId && l.related_id === relatedId)) {
      return { ok: true, end_at: c.end_at, point_cost: 0, idempotent: true };
    }
    const product = products.find((p) => p.id === args.p_product);
    if (!product) return { ok: false, error: "not_found" };
    if (product.domain !== c.domain) return { ok: false, error: "domain_mismatch" };
    const cost = Number(product.point_cost);
    if (Number(args.p_expected_cost) !== cost) {
      return { ok: false, error: "price_changed", point_cost: cost, duration_days: product.duration_days };
    }
    if ((state.balance ?? 1_000_000) < cost) return { ok: false, error: "insufficient_balance" };
    if (state.capacityFull) return { ok: false, error: "capacity_full" };
    const nowMs = Date.parse("2026-08-10T00:00:00.000Z");
    const base = Math.max(nowMs, c.end_at ? Date.parse(String(c.end_at)) : 0);
    const endAt = new Date(base + Number(product.duration_days) * 86_400_000).toISOString();
    state.ledger.push({ user_id: userId, related_type: "feed_ad_request", related_id: relatedId, amount: -cost });
    state.balance = (state.balance ?? 1_000_000) - cost;
    c.end_at = endAt;
    req.end_at = endAt;
    return { ok: true, end_at: endAt, point_cost: cost, idempotent: false };
  }

  return {
    from(table: string) {
      return tableApi(table);
    },
    rpc: async (fn: string, args: Row) => {
      state.rpcCalls?.push({ fn, args });
      if (fn !== "member_feed_ad_renew") return { data: null, error: { message: "unknown_fn" } };
      return { data: memberFeedAdRenew(args), error: null };
    },
  } as unknown as SupabaseClient;
}

describe("PHASE 3 eligibility (D1–D4)", () => {
  const now = Date.parse("2026-08-10T12:00:00.000Z");

  it("D1 active + valid time → eligible", () => {
    expect(
      isFeedAdCampaignEligibleNow(
        {
          status: "active",
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-08-17T00:00:00.000Z",
        },
        now
      )
    ).toBe(true);
  });

  it("D2 before starts_at → not eligible", () => {
    expect(
      isFeedAdCampaignEligibleNow(
        {
          status: "active",
          startAt: "2026-08-11T00:00:00.000Z",
          endAt: "2026-08-20T00:00:00.000Z",
        },
        now
      )
    ).toBe(false);
  });

  it("D3 after ends_at → not eligible (ends_at == now also false)", () => {
    expect(
      isFeedAdCampaignEligibleNow(
        {
          status: "active",
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-08-10T12:00:00.000Z",
        },
        now
      )
    ).toBe(false);
    expect(
      isFeedAdCampaignEligibleNow(
        {
          status: "active",
          startAt: "2026-08-01T00:00:00.000Z",
          endAt: "2026-08-09T00:00:00.000Z",
        },
        now
      )
    ).toBe(false);
  });

  it("D4 member state after expiry → ended", () => {
    const p = projectFeedAdMemberPresentation({
      requestStatus: "active",
      startAt: "2026-08-01T00:00:00.000Z",
      endAt: "2026-08-09T00:00:00.000Z",
      nowMs: now,
    });
    expect(p.displayStatus).toBe("ended");
    expect(p.eligible).toBe(false);
  });
});

describe("PHASE 3 slot + delivery (D5-D8)", () => {
  it("D5/D6 cadence gaps in [4,6]; selection separate", () => {
    expect(FEED_AD_SLOT_GAP_MIN).toBe(4);
    expect(FEED_AD_SLOT_GAP_MAX).toBe(6);
    expect(FEED_AD_SLOT_AFTER_CONTENT_COUNT).toBe(4);
    const legacyPlan = planFeedAdSlots(20, "legacy-single-slot");
    const firstInject = [...legacyPlan.injectAfterIndex].sort((a, b) => a - b)[0]!;
    expect(firstInject).toBeGreaterThanOrEqual(FEED_AD_SLOT_GAP_MIN - 1);
    expect(firstInject).toBeLessThanOrEqual(FEED_AD_SLOT_GAP_MAX - 1);
    expect(shouldInjectFeedAdAfterContentIndex(firstInject, 20, true)).toBe(true);
    expect(shouldInjectFeedAdAfterContentIndex(firstInject, firstInject, true)).toBe(false);
    expect(shouldInjectFeedAdAfterContentIndex(0, 20, true)).toBe(
      legacyPlan.injectAfterIndex.has(0)
    );

    const a = camp({ id: "a", priority: 1 });
    const b = camp({ id: "b", priority: 2 });
    const picked = selectCampaignForPlacement([a, b], {
      domain: "trade",
      placement: "TRADE_HOME",
      nowMs: 86_400_000 * 10,
      feedSessionId: "sess-test",
      slotOrdinal: 0,
    });
    expect(picked?.id).toBeTruthy();
  });

  it("D7 preview geometry tokens match runtime media class (placement 3:1)", () => {
    const trade = getFeedAdCreativeSpec("trade");
    const community = getFeedAdCreativeSpec("community");
    expect(trade.mediaClass).toBe(feedAdMediaClass("trade"));
    expect(community.mediaClass).toBe(feedAdMediaClass("community"));
    expect(trade.mediaClass).toBe(community.mediaClass);
    expect(trade.objectFit).toBe("cover");
    expect(trade.mediaClass).toContain("object-cover");
    expect(trade.mediaClass).toContain("aspect-[3/1]");
    expect(trade.mediaClass).not.toMatch(/h-\[\d+px\]/);
    expect(community.mediaClass).toContain("aspect-[3/1]");
  });

  it("D8 pagination: deterministic multi-slot plan; gaps 4-6; stable on grow", () => {
    const seed = "community:home|sess-a";
    const plan20 = planFeedAdSlots(20, seed);
    const plan40 = planFeedAdSlots(40, seed);
    const hits20 = [...plan20.injectAfterIndex].sort((a, b) => a - b);
    expect(hits20.length).toBeGreaterThanOrEqual(1);
    let prev = -1;
    for (const idx of hits20) {
      const gap = idx - prev;
      expect(gap).toBeGreaterThanOrEqual(FEED_AD_SLOT_GAP_MIN);
      expect(gap).toBeLessThanOrEqual(FEED_AD_SLOT_GAP_MAX);
      prev = idx;
      expect(shouldInjectFeedAdAtContentIndex(idx, plan40)).toBe(true);
    }
    expect(shouldInjectFeedAdAfterContentIndex(3, 20, true)).toBe(false);
  });
});

describe("PHASE 3 renewal (D9–D14 · D-01 DB 함수 한 트랜잭션)", () => {
  beforeEach(() => {
    vi.mocked(spendUserPoints).mockClear();
    vi.mocked(creditUserPoints).mockClear();
  });

  const NOW = Date.parse("2026-08-10T00:00:00.000Z");
  const stateWith = (over: Partial<Row> = {}, extra: Partial<Parameters<typeof makeRenewDb>[0]> = {}) => ({
    campaigns: [
      {
        id: "camp-1",
        source: "MEMBER_REQUESTED",
        request_id: "req-1",
        domain: "trade",
        status: "active",
        end_at: "2026-08-12T00:00:00.000Z",
        paused_by: null,
        ...over,
      } as Row,
    ],
    requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }] as Row[],
    ledger: [] as Row[],
    rpcCalls: [] as { fn: string; args: Row }[],
    ...extra,
  });
  const renew = (sb: SupabaseClient, key: string, more: Partial<Parameters<typeof renewFeedAdCampaign>[1]> = {}) =>
    renewFeedAdCampaign(sb, {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: key,
      expectedCost: 15000,
      ...more,
    });

  it("renewal end base = max(now, current end)", () => {
    const fromFuture = computeFeedAdRenewalEndAt({ currentEndAt: "2026-08-20T00:00:00.000Z", durationDays: 7, nowMs: NOW });
    expect(Date.parse(fromFuture)).toBe(Date.parse("2026-08-27T00:00:00.000Z"));
    const fromPast = computeFeedAdRenewalEndAt({ currentEndAt: "2026-08-01T00:00:00.000Z", durationDays: 7, nowMs: NOW });
    expect(Date.parse(fromPast)).toBe(Date.parse("2026-08-17T00:00:00.000Z"));
  });

  it("D9 연장 성공 → DB 함수 1회(화면 가격 전달) · 종료일 +7일 · 원장 1행 · TS 차감 0", async () => {
    const state = stateWith();
    const res = await renew(makeRenewDb(state), "idem-1");
    expect(res).toMatchObject({ ok: true, campaignId: "camp-1", pointCost: 15000, idempotentReplay: false });
    if (res.ok) expect(Date.parse(res.endAt)).toBe(Date.parse("2026-08-19T00:00:00.000Z"));
    expect(state.rpcCalls).toEqual([
      {
        fn: "member_feed_ad_renew",
        args: { p_user: "u1", p_campaign: "camp-1", p_product: "feed_banner_trade_7", p_key: "idem-1", p_expected_cost: 15000 },
      },
    ]);
    expect(state.ledger).toHaveLength(1);
    expect(spendUserPoints).not.toHaveBeenCalled();
  });

  it("D10 잔액 부족 → 402 · 연장 없음 · 원장 0", async () => {
    const state = stateWith({}, { balance: 100 });
    const res = await renew(makeRenewDb(state), "idem-fail");
    expect(res).toMatchObject({ ok: false, error: "insufficient_balance", httpStatus: 402 });
    expect(state.campaigns[0]?.end_at).toBe("2026-08-12T00:00:00.000Z");
    expect(state.ledger).toHaveLength(0);
  });

  it("D11 자리 없음 → 409 capacity_full · 원장 0 · TS 환급 경로 없음", async () => {
    const state = stateWith({}, { capacityFull: true });
    const res = await renew(makeRenewDb(state), "idem-ext-fail");
    expect(res).toMatchObject({ ok: false, error: "capacity_full", httpStatus: 409 });
    expect(state.ledger).toHaveLength(0);
    expect(creditUserPoints).not.toHaveBeenCalled();
    expect(state.campaigns[0]?.end_at).toBe("2026-08-12T00:00:00.000Z");
  });

  it("D12 (D-01) 이미 처리된 같은 키를 다시 보내면 연장하지 않는다 — 종료일 불변 · 차감 없음", async () => {
    // 첫 결제(키 idem-dup)로 이미 08-12 → 08-19 로 늘어난 상태
    const state = stateWith(
      { end_at: "2026-08-19T00:00:00.000Z" },
      { ledger: [{ user_id: "u1", related_type: "feed_ad_request", related_id: "renew:camp-1:idem-dup", amount: -15000 }] }
    );
    const sb = makeRenewDb(state);
    for (let i = 0; i < 3; i += 1) {
      const res = await renewFeedAdCampaign(sb, {
        userId: "u1",
        campaignId: "camp-1",
        productId: "feed_banner_trade_7",
        idempotencyKey: "idem-dup",
        expectedCost: 15000,
        nowMs: NOW,
      } as Parameters<typeof renewFeedAdCampaign>[1]);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.idempotentReplay).toBe(true);
        expect(res.endAt).toBe("2026-08-19T00:00:00.000Z");
      }
    }
    expect(state.campaigns[0]?.end_at).toBe("2026-08-19T00:00:00.000Z");
    expect(state.ledger).toHaveLength(1);
    expect(spendUserPoints).not.toHaveBeenCalled();
  });

  it("D12b 새 키 1번 + 같은 키 재전송 2번 → 기간은 1번만 늘어난다", async () => {
    const state = stateWith();
    const sb = makeRenewDb(state);
    await renew(sb, "idem-once");
    await renew(sb, "idem-once");
    await renew(sb, "idem-once");
    expect(state.campaigns[0]?.end_at).toBe("2026-08-19T00:00:00.000Z");
    expect(state.ledger).toHaveLength(1);
  });

  it("D-01 화면 가격과 지금 가격이 다르면 409 price_changed + 지금 가격 · 차감·연장 없음", async () => {
    const state = stateWith();
    const res = await renew(makeRenewDb(state), "idem-price", { expectedCost: 9000 });
    expect(res).toMatchObject({ ok: false, error: "price_changed", httpStatus: 409, pointCost: 15000, durationDays: 7 });
    expect(state.ledger).toHaveLength(0);
    expect(state.campaigns[0]?.end_at).toBe("2026-08-12T00:00:00.000Z");
  });

  it("가격 확인값이 없는 옛 화면 → 지금 상품 가격을 확인값으로 넘긴다", async () => {
    const state = stateWith();
    const res = await renew(makeRenewDb(state), "idem-old-ui", { expectedCost: undefined });
    expect(res.ok).toBe(true);
    expect(state.rpcCalls?.[0]?.args.p_expected_cost).toBe(15000);
  });

  it("DB 함수 오류(응답 없음) → 500 renew_failed (원문 오류 노출 없음 · 화면은 같은 키로 재확인)", async () => {
    const sb = makeRenewDb(stateWith());
    (sb as unknown as { rpc: unknown }).rpc = async () => ({ data: null, error: { message: "connection reset" } });
    const res = await renew(sb, "idem-err");
    expect(res).toEqual({ ok: false, error: "renew_failed", httpStatus: 500 });
  });

  it("D13 unchanged creative → renew allowed", async () => {
    const res = await renew(makeRenewDb(stateWith()), "idem-ok", {
      productId: "feed_banner_trade_3",
      expectedCost: 8000,
      creativeOrDestinationChanged: false,
    });
    expect(res.ok).toBe(true);
  });

  it("D14 changed creative → re_review_required (DB 호출 없음)", async () => {
    const state = stateWith();
    const res = await renew(makeRenewDb(state), "idem-x", { creativeOrDestinationChanged: true });
    expect(res).toMatchObject({ ok: false, error: "re_review_required" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it.each([
    ["paused", "admin_paused"],
    ["ended", "admin_ended"],
  ])("관리자가 %s 한 광고는 연장 불가 → 409 %s · 캠페인 그대로", async (status, error) => {
    const state = stateWith({ status, paused_by: status === "paused" ? "admin" : null });
    const res = await renew(makeRenewDb(state), `idem-${status}`);
    expect(res).toMatchObject({ ok: false, error, httpStatus: 409 });
    expect(state.campaigns[0]?.status).toBe(status);
    expect(state.ledger).toHaveLength(0);
  });
});
