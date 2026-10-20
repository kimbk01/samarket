/**
 * R7 목록 표준 — 거래 Admin 목록 API 계약 (가짜 DB).
 * `limit`(20/50/100 만, 그 외 50) · `offset` → `.range(offset, offset+limit-1)` · `total` = DB count(exact) · 고정 상한 제거.
 * 파라미터가 없을 때의 기존 응답(다른 호출자 호환)도 함께 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = {
  table: string;
  selectCols?: string;
  selectOpts?: { count?: string; head?: boolean };
  filters: Array<[string, string, unknown]>;
  range?: [number, number];
  limit?: number;
};
type Result = { data: unknown; error: unknown; count?: number | null };

const calls: Call[] = [];
let handler: (c: Call) => Result = () => ({ data: [], error: null, count: 0 });

function from(table: string) {
  const call: Call = { table, filters: [] };
  const b: Record<string, unknown> = {};
  const chain =
    (fn: (...a: unknown[]) => void) =>
    (...a: unknown[]) => {
      fn(...a);
      return b;
    };
  const filter = (kind: string) => chain((c, v) => call.filters.push([kind, String(c), v]));
  const resolve = () => {
    calls.push(call);
    return Promise.resolve(handler(call));
  };
  Object.assign(b, {
    select: chain((cols, opts) => {
      call.selectCols = String(cols ?? "*");
      call.selectOpts = (opts ?? {}) as Call["selectOpts"];
    }),
    eq: filter("eq"),
    neq: filter("neq"),
    is: filter("is"),
    in: filter("in"),
    gt: filter("gt"),
    gte: filter("gte"),
    lt: filter("lt"),
    lte: filter("lte"),
    ilike: filter("ilike"),
    not: chain((c, op, v) => call.filters.push(["not", String(c), [op, v]])),
    or: chain((v) => call.filters.push(["or", "", v])),
    order: chain(() => undefined),
    limit: chain((n) => {
      call.limit = Number(n);
    }),
    range: chain((f, t) => {
      call.range = [Number(f), Number(t)];
    }),
    maybeSingle: resolve,
    single: resolve,
    then: (ok: (v: Result) => unknown, err?: (e: unknown) => unknown) => resolve().then(ok, err),
  });
  return b;
}
const fakeSb = { from, rpc: async () => ({ data: null, error: null }) };

vi.mock("@/lib/admin/trade-admin/trade-admin-guards", () => ({
  requireTradeAdmin: async () => ({ ok: true, userId: "admin-1", sb: fakeSb }),
}));
vi.mock("@/lib/admin-community/member-identity", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadAdminMemberIdentityMap: async () => new Map(),
  formatAdminMemberLabel: () => "회원",
}));
vi.mock("@/lib/admin-reviews/batch-nicknames-server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  batchNicknamesByUserIds: async () => ({}),
  batchUserIdentityByUserIds: async () => ({}),
}));
vi.mock("@/lib/env/runtime", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requireSupabaseEnv: () => ({ ok: true, url: "http://db.local", anonKey: "anon", serviceKey: "service" }),
}));
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createClient: () => fakeSb,
}));
vi.mock("@/lib/admin/verify-admin-user-server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getServiceOrAnonClient: () => fakeSb,
}));

import { parseTradeAdminListPage } from "@/lib/admin/trade-admin/trade-admin-list-page";
import { GET as auditGET } from "@/app/api/admin/trade/audit/route";
import { GET as restrictionsGET } from "@/app/api/admin/trade/restrictions/route";
import { GET as promotionsGET } from "@/app/api/admin/trade/promotions/route";
import { GET as favoriteAuditGET } from "@/app/api/admin/favorite-audit/route";
import { GET as reviewsGET, POST as reviewsPOST } from "@/app/api/admin/transaction-reviews/route";
import { POST as tradeFlowPOST } from "@/app/api/admin/trade-flow/route";
import { POST as tradeCompletionPOST } from "@/app/api/admin/trade-completion/route";

const req = (path: string, params: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}?${new URLSearchParams(params).toString()}`);
const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;
const listCall = (table: string): Call => {
  const c = calls.find((x) => x.table === table && x.range && !x.selectOpts?.head);
  if (!c) throw new Error(`no paged select on ${table}`);
  return c;
};

beforeEach(() => {
  calls.length = 0;
  handler = () => ({ data: [], error: null, count: 0 });
});

describe("parseTradeAdminListPage — 20/50/100 만", () => {
  it.each([
    ["20", 20],
    ["50", 50],
    ["100", 100],
    ["10", 50],
    ["1", 50],
    ["500", 50],
    ["", 50],
  ])("limit=%s → %i", (raw, expected) => {
    expect(parseTradeAdminListPage(new URLSearchParams(raw ? { limit: raw } : {})).limit).toBe(expected);
  });
  it("offset 음수·NaN → 0", () => {
    expect(parseTradeAdminListPage(new URLSearchParams({ offset: "-5" })).offset).toBe(0);
    expect(parseTradeAdminListPage(new URLSearchParams({ offset: "abc" })).offset).toBe(0);
    expect(parseTradeAdminListPage(new URLSearchParams({ offset: "40" })).offset).toBe(40);
  });
});

describe("거래 목록 GET — range · total(count exact)", () => {
  it("운영 기록: limit=100&offset=200 → range(200, 299) · total = DB count", async () => {
    handler = (c) => (c.table === "audit_logs" ? { data: [{ id: "a1" }], error: null, count: 1234 } : { data: [], error: null });
    const j = await json(await auditGET(req("/api/admin/trade/audit", { limit: "100", offset: "200", period: "all" })));
    const c = listCall("audit_logs");
    expect(c.range).toEqual([200, 299]);
    expect(c.selectOpts?.count).toBe("exact");
    expect(j.total).toBe(1234);
    expect(j.limit).toBe(100);
    expect(j.offset).toBe(200);
  });

  it("거래 활동 제한: limit=500(허용 밖) → 기본 50 · total = DB count", async () => {
    handler = (c) => (c.table === "sanctions" ? { data: [], error: null, count: 77 } : { data: [], error: null });
    const j = await json(await restrictionsGET(req("/api/admin/trade/restrictions", { status: "all", limit: "500", offset: "0" })));
    expect(listCall("sanctions").range).toEqual([0, 49]);
    expect(j.total).toBe(77);
  });

  it("거래 홍보: limit=20&offset=40 → range(40, 59) · total = DB count", async () => {
    handler = (c) =>
      c.table === "point_promotion_orders" && !c.selectOpts?.head
        ? { data: [], error: null, count: 61 }
        : { data: [], error: null, count: 0 };
    const j = await json(await promotionsGET(req("/api/admin/trade/promotions", { tab: "all", limit: "20", offset: "40" })));
    expect(listCall("point_promotion_orders").range).toEqual([40, 59]);
    expect(j.total).toBe(61);
  });

  it("찜 기록: limit=10(허용 밖) → 기본 50", async () => {
    handler = (c) => (c.table === "favorite_audit_log" ? { data: [], error: null, count: 3 } : { data: [], error: null });
    const j = await json(await favoriteAuditGET(new Request("http://localhost/api/admin/favorite-audit?limit=10&offset=0")));
    expect(listCall("favorite_audit_log").range).toEqual([0, 49]);
    expect(j.total).toBe(3);
  });
});

describe("거래 후기 /api/admin/transaction-reviews — 500건 고정 상한 제거", () => {
  it("GET limit=20&offset=20 → DB range(20, 39) · total = DB count · .limit(500) 없음", async () => {
    handler = (c) =>
      c.table === "transaction_reviews"
        ? {
            data: [
              {
                id: "r1",
                product_id: "p1",
                room_id: null,
                reviewer_id: "u1",
                reviewee_id: "u2",
                role_type: "buyer_to_seller",
                public_review_type: "good",
                created_at: "2026-10-20T00:00:00Z",
              },
            ],
            error: null,
            count: 812,
          }
        : { data: null, error: null };
    const j = await json(await reviewsGET(req("/api/admin/transaction-reviews", { limit: "20", offset: "20" })));
    const c = listCall("transaction_reviews");
    expect(c.range).toEqual([20, 39]);
    expect(c.limit).toBeUndefined();
    expect(c.selectOpts?.count).toBe("exact");
    expect(j.total).toBe(812);
    expect((j.reviews as unknown[]).length).toBe(1);
  });

  it("필터는 DB 조건으로 — 별점 5 = good · 역할 seller_to_buyer", async () => {
    await reviewsGET(req("/api/admin/transaction-reviews", { rating: "5", role: "seller_to_buyer" }));
    const c = listCall("transaction_reviews");
    expect(c.filters).toContainEqual(["eq", "public_review_type", "good"]);
    expect(c.filters).toContainEqual(["eq", "role_type", "seller_to_buyer"]);
    expect(c.range).toEqual([0, 49]);
  });

  it("상태 hidden(운영 DB 에 숨김 컬럼 없음) → 0건 · DB 조회 없음 (예전 화면과 같은 결과)", async () => {
    const j = await json(await reviewsGET(req("/api/admin/transaction-reviews", { status: "hidden" })));
    expect(j.total).toBe(0);
    expect(calls.some((c) => c.table === "transaction_reviews")).toBe(false);
  });

  it("POST 상세(reviewId)는 그대로 — 목록 페이지 조회 없음", async () => {
    handler = () => ({ data: null, error: null });
    const j = await json(await reviewsPOST(post("/api/admin/transaction-reviews", { reviewId: "r1" })));
    expect(j.review).toBeNull();
    expect(calls.find((c) => c.table === "transaction_reviews")?.range).toBeUndefined();
  });
});

describe("거래 운영 /api/admin/trade-flow — 세 목록 서버 페이지", () => {
  it("본문 limit 이 있으면 세션·후기·기록 각각 range + total", async () => {
    handler = (c) => {
      if (c.table === "product_chats") return { data: [], error: null, count: 450 };
      if (c.table === "transaction_reviews") return { data: [], error: null, count: 90 };
      if (c.table === "reputation_logs") return { data: [], error: null, count: 33 };
      return { data: [], error: null };
    };
    const j = await json(
      await tradeFlowPOST(
        post("/api/admin/trade-flow", {
          limit: 100,
          offset: 300,
          reviewsLimit: 20,
          reviewsOffset: 40,
          logsLimit: 50,
          logsOffset: 0,
        })
      )
    );
    expect(listCall("product_chats").range).toEqual([300, 399]);
    expect(listCall("transaction_reviews").range).toEqual([40, 59]);
    expect(listCall("reputation_logs").range).toEqual([0, 49]);
    expect(j.sessionsTotal).toBe(450);
    expect(j.reviewsTotal).toBe(90);
    expect(j.logsTotal).toBe(33);
  });

  it("딥링크 postId 는 DB 조건 (페이지 밖 세션도 찾는다)", async () => {
    await tradeFlowPOST(post("/api/admin/trade-flow", { limit: 20, offset: 0, postId: "post-1" }));
    expect(listCall("product_chats").filters).toContainEqual(["eq", "post_id", "post-1"]);
  });

  it("본문 limit 이 없으면 기존 응답 (세션 200 · 후기 60 · 기록 80)", async () => {
    const j = await json(await tradeFlowPOST(post("/api/admin/trade-flow", {})));
    expect(listCall("product_chats").range).toEqual([0, 199]);
    expect(listCall("transaction_reviews").range).toEqual([0, 59]);
    expect(listCall("reputation_logs").range).toEqual([0, 79]);
    expect(j.sessionsTotal).toBeUndefined();
  });
});

describe("구매자 확인 /api/admin/trade-completion — 서버 페이지", () => {
  it("본문 limit=50&offset=50 → range(50, 99) · total = DB count", async () => {
    handler = (c) => (c.table === "product_chats" ? { data: [], error: null, count: 401 } : { data: [], error: null });
    const j = await json(await tradeCompletionPOST(post("/api/admin/trade-completion", { limit: 50, offset: 50 })));
    expect(listCall("product_chats").range).toEqual([50, 99]);
    expect(j.total).toBe(401);
  });

  it("본문이 없으면 기존 응답 (최근 400건)", async () => {
    const j = await json(await tradeCompletionPOST(post("/api/admin/trade-completion", {})));
    expect(listCall("product_chats").range).toEqual([0, 399]);
    expect(j.total).toBeUndefined();
  });
});
