/**
 * 재감사 R2 (Owner 2026-11-03 「3명이 상위노출을 하면 최신순 · 기간 이전에 추가 결제하면 연장 · 기간 지나면 다시 올려야」)
 * D-1 연장은 자리 그대로 · D-2 위쪽 개수(Owner 2026-11-05 1건) 밖은 일반 자리 「광고」 · D-3 예약중도 「광고」 · D-4 커뮤니티 같은 규칙.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  applyTradeHomePromotionProjection,
  listActiveTradePromotionTargetIds,
  postHasTradePromotionOverlay,
} from "@/lib/promotion/feed-promotion-projection";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

type Call = { table: string; ops: Array<[string, unknown[]]> };

/** PostgREST 체인 흉내 — 표마다 정해 둔 행을 돌려주고 호출을 기록한다 */
function fakeSb(rowsByTable: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const sb = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "lte", "gte", "order", "limit", "in"]) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: rowsByTable[table] ?? [], error: null });
      return builder;
    },
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

const NOW = Date.now();
const iso = (offsetMin: number) => new Date(NOW + offsetMin * 60_000).toISOString();
const order = (target: string, startMinAgo: number) => ({
  target_id: target,
  start_at: iso(-startMinAgo),
  end_at: iso(60 * 24),
  product_id: "trade_promote_7",
  target_type: "product",
  order_status: "active",
});
const postRow = (id: string) => ({
  id,
  title: id,
  status: "active",
  trade_category_id: "cat",
  moderation_state: "visible",
  owner_state: "none",
  is_deleted: false,
});
const organic = (id: string) => ({ id, title: id, status: "active" }) as PostWithMeta;

describe("재감사 R2 — 거래 목록 최근 결제 순·2번째 결제부터 일반 자리 광고 표시", () => {
  it("광고 권리는 start_at 내림차순으로 읽는다(끼우는 순서의 기준)", async () => {
    const { sb, calls } = fakeSb({ point_promotion_orders: [order("p1", 1)] });
    const out = await listActiveTradePromotionTargetIds(sb);
    expect(out.map((e) => e.targetId)).toEqual(["p1"]);
    expect(out[0]?.startAt).toBeTruthy();
    const orderOps = calls[0]!.ops.filter(([op]) => op === "order");
    expect(orderOps).toEqual([["order", ["start_at", { ascending: false }]]]);
  });

  it("1페이지 (Owner 2026-11-05 「1건」): 최근 결제 1개만 첫 칸 뒤에 끼우고, 2번째 결제부터는 일반 자리 그대로 「광고」 표시", async () => {
    // DB 가 start_at 내림차순으로 준다: p1(1분 전) · p2 · p3 · p4(가장 오래)
    const { sb } = fakeSb({
      point_promotion_orders: [order("p1", 1), order("p2", 2), order("p3", 3), order("p4", 4)],
      posts: [postRow("p4"), postRow("p3"), postRow("p2"), postRow("p1")],
    });
    const res = await applyTradeHomePromotionProjection(sb, {
      pageIndex: 0,
      posts: [organic("a"), organic("p4"), organic("b"), organic("p2")],
      tradeCategoryIds: null,
    });
    expect(res.posts.map((p) => p.id)).toEqual(["a", "p1", "p4", "b", "p2"]);
    expect(res.promotedIdsOnPage).toEqual(["p1"]);
    const badged = res.posts.filter((p) => postHasTradePromotionOverlay(p)).map((p) => p.id);
    expect(badged).toEqual(["p1", "p4", "p2"]);
    expect(res.hasPromotionOverlay).toBe(true);
  });

  it("뒤 페이지: 순서는 그대로, 광고 중인 글에 「광고」 표시만", async () => {
    const { sb } = fakeSb({ point_promotion_orders: [order("p9", 5)] });
    const res = await applyTradeHomePromotionProjection(sb, {
      pageIndex: 1,
      posts: [organic("x"), organic("p9"), organic("y")],
      tradeCategoryIds: null,
    });
    expect(res.posts.map((p) => p.id)).toEqual(["x", "p9", "y"]);
    expect(res.promotedIdsOnPage).toEqual([]);
    expect(res.posts.filter((p) => postHasTradePromotionOverlay(p)).map((p) => p.id)).toEqual(["p9"]);
  });
});

describe("재감사 R2 — 연장 (DB·API·창)", () => {
  const mig = read("supabase/migrations/20271103240000_promotion_extend_and_refund_sum.sql");

  it("DB: 거래·커뮤니티 결제 함수가 광고 중인 내 주문을 연장하고, 일시정지·심사 중·남의 주문은 막는다", () => {
    expect(mig).toContain("'purchase_member_content_promotion'");
    expect(mig).toContain("'purchase_member_community_promotion'");
    expect(mig.match(/'promotion_extend', -p_point_cost/g)?.length).toBe(2);
    expect(mig.match(/v_running\.order_status <> 'active' OR v_running\.user_id IS DISTINCT FROM p_user_id/g)?.length).toBe(2);
    expect(mig).toContain("SET end_at = end_at + make_interval(days => p_duration_days)");
    expect(mig).not.toMatch(/SET[^;]*start_at\s*=/);
  });

  it("DB: 운영 종료 환급은 첫 결제 + 연장 결제 합계", () => {
    expect(mig.match(/entry_type in \('spend', 'promotion_extend'\)/g)?.length).toBe(2);
    expect(mig).toContain("'admin_trade_promotion_end'");
    expect(mig).toContain("'admin_promotion_end'");
  });

  it("API: 거래·커뮤니티 결제 응답이 연장 여부(extended)를 넘긴다", () => {
    const route = read("app/api/me/points/promotion-orders/route.ts");
    expect(route).toContain("extended: rpc.extended === true");
    expect(route).toContain("extended: applied.extended === true");
    expect(read("lib/promotion/apply-community-paid-exposure.ts")).toContain("rpc.extended === true");
  });

  it("창: 거래 광고 창·커뮤니티 홍보 창이 광고 중이면 연장 줄을 보여 주고, 일시정지면 막는다", () => {
    const trade = read("components/trade/seller-ad/TradeAdQuickSheet.tsx");
    expect(trade).toContain("trade_ad_option_boost_extend");
    expect(trade).toContain("!running.pending && !running.paused");
    const community = read("components/post/MemberPostPromoteSheet.tsx");
    expect(community).toContain("promo_sheet_extend_cta");
    expect(community).toContain("const statusOnly = pendingExisting || pausedExisting;");
  });

  it("어드민 커뮤니티 주문 결제 금액은 결제 합계", () => {
    const admin = read("app/api/admin/community-promotion-orders/route.ts");
    expect(admin).toContain('.in("entry_type", ["spend", "promotion_extend"])');
  });
});

describe("재감사 R2 D-3 — 예약중도 광고 중이면 「광고」", () => {
  it("PostCard 사진 왼쪽 위 칩: 예약중은 NEW 만 막고 광고는 단다", () => {
    const card = read("components/post/PostCard.tsx");
    expect(card).toMatch(/showcase \|\| isSoldOrClosed\s*\n\s*\? null\s*\n\s*: isPromotedContent\s*\n\s*\? "ad"/);
    expect(card).toContain(": !isReserved && nowMs != null && isTradeListingNew(post.created_at, nowMs)");
  });
});
