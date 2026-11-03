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

  return {
    from(table: string) {
      return tableApi(table);
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

describe("PHASE 3 renewal financial (D9–D14)", () => {
  beforeEach(() => {
    vi.mocked(spendUserPoints).mockClear();
    vi.mocked(creditUserPoints).mockClear();
    vi.mocked(spendUserPoints).mockResolvedValue({ ok: true, balanceAfter: 50 });
    vi.mocked(creditUserPoints).mockResolvedValue({ ok: true, balanceAfter: 50 });
  });

  it("renewal end base = max(now, current end)", () => {
    const now = Date.parse("2026-08-10T00:00:00.000Z");
    const fromFuture = computeFeedAdRenewalEndAt({
      currentEndAt: "2026-08-20T00:00:00.000Z",
      durationDays: 7,
      nowMs: now,
    });
    expect(Date.parse(fromFuture)).toBe(Date.parse("2026-08-27T00:00:00.000Z"));
    const fromPast = computeFeedAdRenewalEndAt({
      currentEndAt: "2026-08-01T00:00:00.000Z",
      durationDays: 7,
      nowMs: now,
    });
    expect(Date.parse(fromPast)).toBe(Date.parse("2026-08-17T00:00:00.000Z"));
  });

  it("D9 renew success → spend + end_at extension", async () => {
    const now = Date.parse("2026-08-10T00:00:00.000Z");
    const state = {
      campaigns: [
        {
          id: "camp-1",
          source: "MEMBER_REQUESTED",
          request_id: "req-1",
          domain: "trade",
          status: "active",
          end_at: "2026-08-12T00:00:00.000Z",
        },
      ],
      requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }],
      ledger: [] as Row[],
    };
    const sb = makeRenewDb(state);
    const res = await renewFeedAdCampaign(sb, {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-1",
      nowMs: now,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Date.parse(res.endAt)).toBe(Date.parse("2026-08-19T00:00:00.000Z"));
    }
    expect(spendUserPoints).toHaveBeenCalledTimes(1);
    expect(state.campaigns[0]?.end_at).toBe("2026-08-19T00:00:00.000Z");
  });

  it("D10 renew financial failure → no extension", async () => {
    vi.mocked(spendUserPoints).mockResolvedValueOnce({
      ok: false,
      error: "insufficient_balance",
      code: "insufficient_balance",
    });
    const state = {
      campaigns: [
        {
          id: "camp-1",
          source: "MEMBER_REQUESTED",
          request_id: "req-1",
          domain: "trade",
          status: "active",
          end_at: "2026-08-12T00:00:00.000Z",
        },
      ],
      requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }],
      ledger: [] as Row[],
    };
    const sb = makeRenewDb(state);
    const res = await renewFeedAdCampaign(sb, {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-fail",
      nowMs: Date.parse("2026-08-10T00:00:00.000Z"),
    });
    expect(res.ok).toBe(false);
    expect(state.campaigns[0]?.end_at).toBe("2026-08-12T00:00:00.000Z");
  });

  it("D11 extension failure → Point refund (no leak)", async () => {
    const state = {
      campaigns: [
        {
          id: "camp-1",
          source: "MEMBER_REQUESTED",
          request_id: "req-1",
          domain: "trade",
          status: "active",
          end_at: "2026-08-12T00:00:00.000Z",
        },
      ],
      requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }],
      ledger: [] as Row[],
      failCampaignUpdate: true,
    };
    const sb = makeRenewDb(state);
    const res = await renewFeedAdCampaign(sb, {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-ext-fail",
      nowMs: Date.parse("2026-08-10T00:00:00.000Z"),
    });
    expect(res.ok).toBe(false);
    expect(creditUserPoints).toHaveBeenCalledTimes(1);
  });

  it("D12 double renew same key → no second spend when already extended", async () => {
    const now = Date.parse("2026-08-10T00:00:00.000Z");
    const state = {
      campaigns: [
        {
          id: "camp-1",
          source: "MEMBER_REQUESTED",
          request_id: "req-1",
          domain: "trade",
          status: "active",
          end_at: "2026-08-19T00:00:00.000Z",
        },
      ],
      requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }],
      ledger: [
        {
          user_id: "u1",
          related_type: "feed_ad_request",
          related_id: "renew:camp-1:idem-dup",
        },
      ] as Row[],
    };
    const sb = makeRenewDb(state);
    const res = await renewFeedAdCampaign(sb, {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-dup",
      nowMs: now,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.idempotentReplay).toBe(true);
    expect(spendUserPoints).not.toHaveBeenCalled();
  });

  it("D13 unchanged creative → renew allowed", async () => {
    const res = await renewFeedAdCampaign(makeRenewDb({
      campaigns: [
        {
          id: "camp-1",
          source: "MEMBER_REQUESTED",
          request_id: "req-1",
          domain: "trade",
          status: "active",
          end_at: "2026-08-12T00:00:00.000Z",
        },
      ],
      requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }],
      ledger: [],
    }), {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_3",
      idempotencyKey: "idem-ok",
      creativeOrDestinationChanged: false,
      nowMs: Date.parse("2026-08-10T00:00:00.000Z"),
    });
    expect(res.ok).toBe(true);
  });

  it("D14 changed creative → re_review_required", async () => {
    const res = await renewFeedAdCampaign(makeRenewDb({
      campaigns: [],
      requests: [],
      ledger: [],
    }), {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-x",
      creativeOrDestinationChanged: true,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("re_review_required");
  });
});

describe("재감사 2026-11-04 — 회원 연장 (Owner 결정 1 · F-04)", () => {
  beforeEach(() => {
    vi.mocked(spendUserPoints).mockClear();
    vi.mocked(creditUserPoints).mockClear();
    vi.mocked(spendUserPoints).mockResolvedValue({ ok: true, balanceAfter: 50 });
    vi.mocked(creditUserPoints).mockResolvedValue({ ok: true, balanceAfter: 50 });
  });
  const base = (status: string, end_at = "2026-08-12T00:00:00.000Z") => ({
    campaigns: [{ id: "camp-1", source: "MEMBER_REQUESTED", request_id: "req-1", domain: "trade", status, end_at }],
    requests: [{ id: "req-1", user_id: "u1", status: "active", domain: "trade" }],
    ledger: [] as Row[],
  });

  it.each([
    ["paused", "admin_paused"],
    ["ended", "admin_ended"],
  ])("관리자가 %s 한 광고는 결제·연장으로 다시 켤 수 없다 (차감 없음 · 캠페인 그대로)", async (status, error) => {
    const state = base(status);
    const res = await renewFeedAdCampaign(makeRenewDb(state), {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: `idem-${status}`,
      nowMs: Date.parse("2026-08-10T00:00:00.000Z"),
    });
    expect(res).toMatchObject({ ok: false, error, httpStatus: 409 });
    expect(spendUserPoints).not.toHaveBeenCalled();
    expect(state.campaigns[0]?.status).toBe(status);
  });

  it("기간이 끝나 저절로 끝난 광고(active · 종료일 지남)는 연장된다", async () => {
    const state = base("active", "2026-08-01T00:00:00.000Z");
    const res = await renewFeedAdCampaign(makeRenewDb(state), {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-expired",
      nowMs: Date.parse("2026-08-10T00:00:00.000Z"),
    });
    // 끝난 광고를 다시 켜면 자리 검사를 한다 — 흉내 DB 의 다른 캠페인은 없으므로 통과
    expect(res.ok).toBe(true);
    expect(spendUserPoints).toHaveBeenCalledTimes(1);
  });

  it("F-04: 차감됐는데 연장이 「자리 없음」으로 막히면 실제 빠진 금액을 1회 환급한다", async () => {
    const state = {
      ...base("active", "2026-08-12T00:00:00.000Z"),
      ledger: [{ user_id: "u1", related_type: "feed_ad_request", related_id: "renew:camp-1:idem-retry", amount: -15000 }] as Row[],
      failCampaignUpdate: true,
      failCampaignUpdateMessage: "feed_ad_pool_capacity_full",
    };
    const res = await renewFeedAdCampaign(makeRenewDb(state), {
      userId: "u1",
      campaignId: "camp-1",
      productId: "feed_banner_trade_7",
      idempotencyKey: "idem-retry",
      nowMs: Date.parse("2026-08-10T00:00:00.000Z"),
    });
    expect(res).toMatchObject({ ok: false, error: "capacity_full" });
    expect(spendUserPoints).not.toHaveBeenCalled();
    expect(creditUserPoints).toHaveBeenCalledTimes(1);
    expect(vi.mocked(creditUserPoints).mock.calls[0]![1]).toMatchObject({
      userId: "u1",
      amount: 15000,
      relatedId: "renew-refund:camp-1:idem-retry",
    });
  });
});
