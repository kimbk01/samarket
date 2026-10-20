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
type RpcCall = { fn: string; args: Record<string, unknown> };
const rpcCalls: RpcCall[] = [];
let rpcHandler: (c: RpcCall) => Result = () => ({ data: null, error: null });
const fakeSb = {
  from,
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    const c = { fn, args };
    rpcCalls.push(c);
    return rpcHandler(c);
  },
};

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
import { GET as regionsGET } from "@/app/api/admin/trade/regions/route";
import { GET as membersGET } from "@/app/api/admin/trade/members/route";
import { GET as reportsGET } from "@/app/api/admin/trade/reports/route";
import { GET as tradePointsGET } from "@/app/api/admin/trade/points/route";
import { ADMIN_TRANSACTION_REVIEW_SEARCH_VIEW } from "@/lib/admin-reviews/admin-transaction-reviews-list";
import {
  applyTradePostsWhere,
  loadTradePostsContext,
  parseTradePostsFilter,
  TRADE_ADMIN_OPEN_REPORT_STATUSES,
  TRADE_POST_HAS_OPEN_REPORT_COLUMN,
} from "@/lib/admin/trade-admin/trade-posts-query";
import { readFileSync } from "node:fs";
import path from "node:path";

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
  rpcCalls.length = 0;
  handler = () => ({ data: [], error: null, count: 0 });
  rpcHandler = () => ({ data: null, error: null });
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

  it("채팅(거래) 번호 일부 검색 — 검색 뷰 room_id_text 부분 일치 (room_id 전량 읽기 없음 · 최대 행 수에 안 잘림)", async () => {
    await reviewsGET(req("/api/admin/transaction-reviews", { q: "2F30-AA" }));
    const list = calls.find((c) => c.table === ADMIN_TRANSACTION_REVIEW_SEARCH_VIEW && c.range);
    const or = list?.filters.find((f) => f[0] === "or")?.[2] as string;
    expect(or).toContain("room_id_text.ilike.%2F30-AA%");
    expect(calls.some((c) => c.table === "transaction_reviews" && c.selectCols === "room_id")).toBe(false);
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

describe("R7 잔여 — 거래 지역 /api/admin/trade/regions (DB 집계 RPC)", () => {
  const rpcRows = [{ lgu_id: "L1", name: "City", posts: 3, selling: 1, reserved: 1, sold: 1, hidden: 0, sellers: 2, open_reports: 1, active_promotions: 0 }];

  it("limit=50&offset=50 → admin_trade_region_stats(p_limit 50, p_offset 50) · total = RPC total · posts 5000건 읽기 없음", async () => {
    rpcHandler = () => ({ data: { ok: true, total: 261, post_total: 9000, rows: rpcRows }, error: null });
    const res = await regionsGET(req("/api/admin/trade/regions", { period: "all", limit: "50", offset: "50" }));
    const j = await json(res);
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([
      { fn: "admin_trade_region_stats", args: { p_from: null, p_to: null, p_limit: 50, p_offset: 50 } },
    ]);
    expect(j.total).toBe(261);
    expect(j.post_total).toBe(9000);
    expect(j.limit).toBe(50);
    expect(j.offset).toBe(50);
    expect(j.rows).toEqual(rpcRows);
    expect(calls.some((c) => c.table === "posts" || c.limit === 5000)).toBe(false);
  });

  it("limit 없음(거래글 화면 지역 선택 목록) → 지역 행 전체 (p_limit null) · 기존 rows 모양", async () => {
    rpcHandler = () => ({ data: { ok: true, total: 1, post_total: 3, rows: rpcRows }, error: null });
    const j = await json(await regionsGET(req("/api/admin/trade/regions")));
    expect(rpcCalls[0].args).toMatchObject({ p_limit: null, p_offset: 0 });
    expect(j.rows).toEqual(rpcRows);
    expect(j.limit).toBeUndefined();
  });

  it("기간(from/to) → RPC 의 [p_from, p_to)", async () => {
    rpcHandler = () => ({ data: { ok: true, total: 0, post_total: 0, rows: [] }, error: null });
    await regionsGET(req("/api/admin/trade/regions", { from: "2026-10-01", to: "2026-10-20", limit: "20" }));
    expect(typeof rpcCalls[0].args.p_from).toBe("string");
    expect(typeof rpcCalls[0].args.p_to).toBe("string");
    expect(rpcCalls[0].args.p_limit).toBe(20);
  });

  it("RPC 미적용 → 503 rpc_missing (413 too_many_rows 없음)", async () => {
    rpcHandler = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const res = await regionsGET(req("/api/admin/trade/regions", { limit: "20" }));
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("rpc_missing");
  });
});

describe("R7 잔여 — 거래 회원 /api/admin/trade/members (DB RPC)", () => {
  it("tab·q·limit·offset → admin_trade_members 인자 · total/tabCounts = RPC · posts·chat_rooms 10000건 훑기 없음", async () => {
    rpcHandler = () => ({
      data: {
        ok: true,
        total: 12345,
        tab_counts: { all: 20000, restricted: 12345, suspended: 7 },
        rows: [{ user_id: "u1", account_status: "active", post_count: 3, buyer_chat_count: 2, trade_restrictions: ["chat"] }],
      },
      error: null,
    });
    handler = (c) => (c.table === "reports" ? { data: [{ target_id: "u1" }, { target_id: "u1" }], error: null } : { data: [], error: null });
    const j = await json(
      await membersGET(req("/api/admin/trade/members", { tab: "restricted", q: "kim", limit: "100", offset: "200" }))
    );
    expect(rpcCalls).toEqual([
      { fn: "admin_trade_members", args: { p_tab: "restricted", p_q: "kim", p_user_id: null, p_limit: 100, p_offset: 200 } },
    ]);
    expect(j.total).toBe(12345);
    expect(j.limit).toBe(100);
    expect(j.offset).toBe(200);
    expect(j.capped).toBe(false);
    expect(j.tabCounts).toEqual({ all: 20000, restricted: 12345, suspended: 7 });
    expect(j.rows).toEqual([
      {
        user_id: "u1",
        label: "회원",
        account_status: "active",
        post_count: 3,
        buyer_chat_count: 2,
        trade_restrictions: ["chat"],
        open_user_reports: 2,
      },
    ]);
    expect(calls.some((c) => c.table === "posts" || c.table === "chat_rooms" || c.table === "profiles")).toBe(false);
    expect(calls.some((c) => c.limit === 10000)).toBe(false);
    // 회원 신고는 현재 페이지 회원만
    expect(calls.find((c) => c.table === "reports")?.filters).toContainEqual(["in", "target_id", ["u1"]]);
  });

  it("상세 머리말 userId&limit=1 · 회원 검색 q&limit=20 (다른 호출자) → 같은 응답 모양", async () => {
    const U = "6b1e2f30-aaaa-4bbb-8ccc-0123456789ab";
    rpcHandler = () => ({ data: { ok: true, total: 1, tab_counts: { all: 1, restricted: 0, suspended: 0 }, rows: [] }, error: null });
    const j = await json(await membersGET(req("/api/admin/trade/members", { userId: U, limit: "1" })));
    expect(rpcCalls[0].args).toMatchObject({ p_tab: "all", p_user_id: U, p_q: null, p_limit: 50 });
    expect(Object.keys(j).sort()).toEqual(["capped", "limit", "offset", "ok", "rows", "tabCounts", "total"]);
    await membersGET(req("/api/admin/trade/members", { q: "abc", limit: "20" }));
    expect(rpcCalls[1].args).toMatchObject({ p_q: "abc", p_limit: 20 });
  });

  it("잘못된 tab → 400 (RPC 호출 없음)", async () => {
    const res = await membersGET(req("/api/admin/trade/members", { tab: "x" }));
    expect(res.status).toBe(400);
    expect(rpcCalls.length).toBe(0);
  });
});

describe("R7 잔여 — 거래 신고 sellerId (판매자 거래글 2000건 후보 제거)", () => {
  const SELLER = "6b1e2f30-aaaa-4bbb-8ccc-0123456789ab";

  it("sellerId → 조회 뷰 admin_trade_reports_v 에서 작성자 열 조건 · range · count · posts .limit(2000) 없음", async () => {
    handler = (c) => (c.table === "admin_trade_reports_v" && !c.selectOpts?.head ? { data: [], error: null, count: 3001 } : { data: [], error: null, count: 0 });
    const j = await json(await reportsGET(req("/api/admin/trade/reports", { sellerId: SELLER, tab: "all", limit: "20", offset: "20" })));
    const list = listCall("admin_trade_reports_v");
    expect(list.range).toEqual([20, 39]);
    expect(list.selectOpts?.count).toBe("exact");
    const or = list.filters.find((f) => f[0] === "or")?.[2] as string;
    expect(or).toBe(
      `and(target_type.eq.user,target_id.eq.${SELLER}),product_post_user_id.eq.${SELLER},target_post_user_id.eq.${SELLER}`
    );
    expect(j.total).toBe(3001);
    expect(calls.some((c) => c.table === "posts" && c.limit === 2000)).toBe(false);
    expect(calls.some((c) => c.table === "reports")).toBe(false);
  });

  it("sellerId 없으면 기존대로 reports 테이블", async () => {
    await reportsGET(req("/api/admin/trade/reports", { tab: "open", limit: "50" }));
    expect(listCall("reports").range).toEqual([0, 49]);
    expect(calls.some((c) => c.table === "admin_trade_reports_v")).toBe(false);
  });
});

describe("R7 잔여 — 거래글 「신고 접수」 탭 (대기 신고 2000건 후보 제거)", () => {
  it("reported 탭 = 계산 열 admin_trade_post_has_open_report = true (id in(...) 없음)", async () => {
    const parsed = parseTradePostsFilter(new URLSearchParams());
    if (!parsed.ok) throw new Error("filter");
    const q = applyTradePostsWhere(from("posts"), "reported", parsed.filter, {
      activeTradeCategoryIds: [],
      allTradeCategoryIds: [],
      legacyLguPairs: [],
    });
    await q;
    const c = calls[calls.length - 1];
    expect(c.table).toBe("posts");
    expect(c.filters).toContainEqual(["eq", TRADE_POST_HAS_OPEN_REPORT_COLUMN, true]);
    expect(c.filters.some((f) => f[0] === "in" && f[1] === "id")).toBe(false);
  });

  it("loadTradePostsContext 는 신고를 미리 읽지 않는다 (.limit(2000) 없음)", async () => {
    const r = await loadTradePostsContext(fakeSb as never);
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.table === "reports")).toBe(false);
    expect(calls.some((c) => c.limit === 2000)).toBe(false);
  });

  it("마이그레이션 계산 열의 대기 신고 상태 = TRADE_ADMIN_OPEN_REPORT_STATUSES", () => {
    const sql = readFileSync(
      path.resolve(__dirname, "../../../../supabase/migrations/20270601150000_r7_trade_admin_aggregate_rpcs.sql"),
      "utf8"
    );
    const fn = sql.slice(sql.indexOf("function public.admin_trade_post_has_open_report"));
    const statuses = /r\.status in \(([^)]*)\)/.exec(fn)?.[1] ?? "";
    expect(statuses.split(",").map((x) => x.trim().replace(/'/g, ""))).toEqual([...TRADE_ADMIN_OPEN_REPORT_STATUSES]);
  });
});

describe("R7 잔여 — 거래 후기 검색 (제목·닉네임 200건 후보 제거)", () => {
  it("q → 검색 뷰 열 조건 (post_title · 작성자/대상 닉네임·표시명·아이디) · posts/profiles 후보 조회 없음", async () => {
    await reviewsGET(req("/api/admin/transaction-reviews", { q: "kim", limit: "20", offset: "40" }));
    const c = listCall(ADMIN_TRANSACTION_REVIEW_SEARCH_VIEW);
    expect(c.range).toEqual([40, 59]);
    const or = c.filters.find((f) => f[0] === "or")?.[2] as string;
    for (const col of [
      "review_comment",
      "post_title",
      "reviewer_nickname",
      "reviewer_display_name",
      "reviewer_username",
      "reviewee_nickname",
      "reviewee_display_name",
      "reviewee_username",
    ]) {
      expect(or).toContain(`${col}.ilike.%kim%`);
    }
    expect(or).not.toContain(".in.(");
    expect(calls.some((c2) => c2.table === "profiles" || c2.limit === 200)).toBe(false);
  });
});

describe("R7 잔여 — 거래 활동 제한 닉네임 검색 (200명 후보 제거)", () => {
  it("q → 조회 뷰 admin_trade_sanctions_v 의 user_nickname ilike · profiles .limit(200) 없음", async () => {
    handler = (c) => (c.table === "admin_trade_sanctions_v" ? { data: [], error: null, count: 450 } : { data: [], error: null });
    const j = await json(await restrictionsGET(req("/api/admin/trade/restrictions", { status: "all", q: "kim_1", limit: "100", offset: "100" })));
    const c = listCall("admin_trade_sanctions_v");
    expect(c.range).toEqual([100, 199]);
    expect(c.filters).toContainEqual(["ilike", "user_nickname", "%kim\\_1%"]);
    expect(c.filters).toContainEqual(["eq", "scope", "trade"]);
    expect(j.total).toBe(450);
    expect(calls.some((x) => x.table === "profiles" || x.limit === 200)).toBe(false);
  });

  it("q 없으면 기존대로 sanctions 테이블 (userId 는 eq)", async () => {
    const U = "6b1e2f30-aaaa-4bbb-8ccc-0123456789ab";
    await restrictionsGET(req("/api/admin/trade/restrictions", { status: "all", userId: U }));
    const c = listCall("sanctions");
    expect(c.filters).toContainEqual(["eq", "user_id", U]);
    expect(calls.some((x) => x.table === "admin_trade_sanctions_v")).toBe(false);
  });
});

describe("거래 포인트 원장 /api/admin/trade/points — 홍보 주문 500건·합계 5,000행 상한 제거", () => {
  it("RPC 한 번 (p_domain=trade · 유형·회원·종류·기간 · limit/offset) · total·합계 = RPC 값 · 홍보 주문 id 사전 조회 없음", async () => {
    rpcHandler = () => ({
      data: {
        total: 812,
        sums: { count: 812, amount_in: 900, amount_out: -300 },
        rows: [{ id: "l1", user_id: null, entry_type: "spend", amount: -10, balance_after: 5, related_type: "promotion_order", related_id: "hold:o1", description: null, actor_type: null, created_at: "2026-10-20T00:00:00Z" }],
      },
      error: null,
    });
    const j = await json(await tradePointsGET(req("/api/admin/trade/points", { period: "all", limit: "20", offset: "40", entryType: "spend" })));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("admin_point_ledger_domain_page");
    expect(rpcCalls[0].args).toMatchObject({
      p_domain: "trade",
      p_related_types: ["promotion_order", "trade_post_ad", "admin_manual"],
      p_entry_type: "spend",
      p_limit: 20,
      p_offset: 40,
    });
    expect(j.total).toBe(812);
    expect(j.sums).toEqual({ count: 812, amountIn: 900, amountOut: -300 });
    expect(j.promoOrderIdCapped).toBe(false);
    expect((j.rows as unknown[]).length).toBe(1);
    expect(calls.some((c) => c.table === "point_promotion_orders")).toBe(false);
    expect(calls.some((c) => c.table === "point_ledger")).toBe(false);
  });
});
