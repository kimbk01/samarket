/**
 * 광고 설계 D-10 · D-11 ① (2026-11-07) — 상위노출 중인 커뮤니티 글을 관리자가 숨김·삭제할 때:
 * 귀책 없으면 글 변경 없이 귀책 요구 · 귀책 있으면 DB 함수 `admin_community_post_moderate` **1번**(주문 종료 + 글 상태 한 트랜잭션) ·
 * 성공 후 주문 감사·구매자 알림 · 실패면 글·주문 모두 그대로(TS 의 직접 글 UPDATE 없음) · 진행 중 주문 없으면 기존 CAS 처리.
 * 라우트(PATCH)를 직접 실행한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeCommunitySupabase,
  jsonRequest,
  type FakeCall,
  type FakeResult,
  type FakeRpcCall,
} from "./fake-community-supabase";

/** 호출 순서 기록 (DB 쓰기·RPC·감사·알림) */
const seq: string[] = [];
let promotions: Array<Record<string, unknown>> = [];
let endRpc: (c: FakeRpcCall) => FakeResult = () => ({ data: { ok: true, ended_orders: [], refund_points: 0 }, error: null });

const fake = createFakeCommunitySupabase(
  (c: FakeCall): FakeResult => {
    if (c.table === "community_posts" && c.op === "select") return { data: memberPost, error: null };
    if (c.table === "community_posts" && c.op === "update") {
      seq.push(`post.update:${String((c.values as { status?: string }).status ?? "")}`);
      return { data: { ...memberPost, ...(c.values as object) }, error: null };
    }
    if (c.table === "point_promotion_orders") {
      if (c.terminal === "maybeSingle") {
        const id = c.filters.find(([k, col]) => k === "eq" && col === "id")?.[2];
        const row = promotions.find((p) => p.id === id);
        return { data: row ? { ...row, domain: "community" } : null, error: null };
      }
      return { data: promotions, error: null };
    }
    return { data: null, error: null };
  },
  (c) => {
    seq.push(`rpc:${c.fn}:${String(c.args.p_order_id ?? c.args.p_post)}`);
    return endRpc(c);
  }
);

const audit = vi.fn(async (_sb: unknown, _req: unknown, a: { action: string }) => {
  seq.push(`audit:${a.action}`);
  return { ok: true as const };
});
const notifyContent = vi.fn(async (..._a: unknown[]) => undefined);
const notifyPromotionEnded = vi.fn(async (..._a: unknown[]) => {
  seq.push("notify:promotion_ended");
});
const reclaim = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({ ok: true, userId: "admin-1", actor: { userId: "admin-1" }, sb: fake.sb }),
}));
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...a: unknown[]) => audit(...(a as [unknown, unknown, { action: string }])),
}));
vi.mock("@/lib/notifications/notify-community-moderation", () => ({
  notifyCommunityContentModerated: (...a: unknown[]) => notifyContent(...a),
  notifyCommunityPostPinned: async () => undefined,
  notifyCommunityPromotionEnded: (...a: unknown[]) => notifyPromotionEnded(...a),
}));
vi.mock("@/lib/points/community-point-bridge", () => ({
  applyCommunityPointReclaimOnPostAdminRemove: (...a: unknown[]) => reclaim(...a),
  applyCommunityPointReclaimOnModeration: (...a: unknown[]) => reclaim(...a),
}));

import { PATCH as postPatch } from "@/app/api/admin/community/engine/posts/[postId]/route";

const LOADED = "2026-11-04T01:00:00.123456+00:00";
const memberPost = {
  id: "post-1",
  user_id: "author-1",
  origin_kind: "member",
  status: "active",
  is_reported: false,
  title: "원래 제목",
  content: "원래 본문",
  content_blocks: null,
  topic_id: "topic-1",
  topic_slug: "free",
  is_notice: false,
  updated_at: LOADED,
};
const runningOrder = { id: "ord-1", user_id: "buyer-1", order_status: "active", end_at: "2026-11-10T00:00:00Z" };

async function patch(body: Record<string, unknown>) {
  const res = await postPatch(
    jsonRequest("https://x.test/api/admin/community/engine/posts/post-1", "PATCH", {
      expectedUpdatedAt: LOADED,
      ...body,
    }) as never,
    { params: Promise.resolve({ postId: "post-1" }) }
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const postUpdated = () => fake.calls.some((c) => c.table === "community_posts" && c.op === "update");

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.rpcCalls.length = 0;
  seq.length = 0;
  promotions = [];
  endRpc = () => ({ data: { ok: true, ended_orders: [], refund_points: 0 }, error: null });
});

describe.each([
  ["hidden", "post_hidden"],
  ["deleted", "post_deleted"],
] as const)("관리자 %s — 상위노출 주문 먼저 종료 (D-10)", (status, reasonCode) => {
  it("진행 중 주문 + 귀책 없음 → 글 변경 없음 · promotion_fault_required + 주문 정보", async () => {
    promotions = [runningOrder];
    const r = await patch({ status, reason: "운영 판단" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("promotion_fault_required");
    expect(r.json.promotions).toEqual([{ id: "ord-1", orderStatus: "active", endAt: "2026-11-10T00:00:00Z" }]);
    expect(postUpdated()).toBe(false);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("귀책=operator → admin_community_post_moderate 1번(같은 사유) · 그 뒤 주문 감사·알림 · TS 의 글 UPDATE 없음", async () => {
    promotions = [runningOrder];
    endRpc = () => ({
      data: {
        ok: true,
        ended_orders: [{ order_id: "ord-1", user_id: "buyer-1", refund_points: 420, refund_ledger_id: "led-1" }],
        refund_points: 420,
      },
      error: null,
    });
    const r = await patch({ status, reason: "운영 판단", promotionFault: "operator" });
    expect(r.status).toBe(200);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]!.fn).toBe("admin_community_post_moderate");
    expect(fake.rpcCalls[0]!.args).toEqual({
      p_post: "post-1",
      p_admin: "admin-1",
      p_action: status === "hidden" ? "hide" : "delete",
      p_fault: "operator",
      p_reason: "운영 판단",
      p_expected_updated_at: LOADED,
    });
    expect(seq).toEqual([
      "rpc:admin_community_post_moderate:post-1",
      "audit:community_promotion_order.end",
      "notify:promotion_ended",
      `audit:community_post.status_${status}`,
    ]);
    expect(postUpdated()).toBe(false);
    expect(notifyPromotionEnded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "buyer-1", orderId: "ord-1", refundPoints: 420, reason: "운영 판단" })
    );
    expect(r.json.promotionEnd).toEqual([{ orderId: "ord-1", ok: true, refundPoints: 420, refundLedgerId: "led-1" }]);
    void reasonCode;
  });

  it("귀책=member → p_fault=member 로 같은 함수 1번", async () => {
    promotions = [runningOrder];
    const r = await patch({ status, reason: "회원 위반", promotionFault: "member" });
    expect(r.status).toBe(200);
    expect(fake.rpcCalls[0]!.args).toMatchObject({ p_fault: "member" });
    expect(postUpdated()).toBe(false);
  });

  it("함수 실패(ok:false) → 글·주문 그대로 · 글 감사·작성자 알림·포인트 회수·구매자 알림 0", async () => {
    promotions = [runningOrder];
    endRpc = () => ({ data: { ok: false, error: "promotion_end_failed", order_id: "ord-1", end_error: "not_running" }, error: null });
    const r = await patch({ status, reason: "운영 판단", promotionFault: "operator" });
    expect(r.status).toBe(409);
    expect(r.json).toMatchObject({ ok: false, error: "promotion_end_failed", orderId: "ord-1", endError: "not_running" });
    expect(postUpdated()).toBe(false);
    expect(seq).toEqual(["rpc:admin_community_post_moderate:post-1"]);
    expect(notifyContent).not.toHaveBeenCalled();
    expect(notifyPromotionEnded).not.toHaveBeenCalled();
    expect(reclaim).not.toHaveBeenCalled();
  });

  it("함수 오류(RPC 오류) → 500 · 원문 노출 없음 · 글 변경 0", async () => {
    promotions = [runningOrder];
    endRpc = () => ({ data: null, error: { message: "boom" } });
    const r = await patch({ status, reason: "운영 판단", promotionFault: "operator" });
    expect(r.status).toBe(500);
    expect(r.json.error).toBe("moderate_failed");
    expect(JSON.stringify(r.json)).not.toContain("boom");
    expect(postUpdated()).toBe(false);
  });

  it("주문 2건 → 함수 1번 · 주문별 환급으로 각각 감사·알림", async () => {
    promotions = [runningOrder, { ...runningOrder, id: "ord-2", order_status: "paused", user_id: "buyer-2" }];
    endRpc = () => ({
      data: {
        ok: true,
        ended_orders: [
          { order_id: "ord-1", user_id: "buyer-1", refund_points: 10 },
          { order_id: "ord-2", user_id: "buyer-2", refund_points: 0 },
        ],
        refund_points: 10,
      },
      error: null,
    });
    const r = await patch({ status, reason: "운영 판단", promotionFault: "operator" });
    expect(r.status).toBe(200);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(r.json.promotionEnd).toEqual([
      { orderId: "ord-1", ok: true, refundPoints: 10, refundLedgerId: null },
      { orderId: "ord-2", ok: true, refundPoints: 0, refundLedgerId: null },
    ]);
    expect(notifyPromotionEnded).toHaveBeenCalledTimes(2);
  });

  it("함수 CAS conflict(다른 사람이 먼저 바꿈) → 409 conflict + 최신 글 · 감사·알림 0", async () => {
    promotions = [runningOrder];
    endRpc = () => ({ data: { ok: false, error: "conflict" }, error: null });
    const r = await patch({ status, reason: "운영 판단", promotionFault: "operator" });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("conflict");
    expect(r.json.post).toBeTruthy();
    expect(notifyPromotionEnded).not.toHaveBeenCalled();
    expect(postUpdated()).toBe(false);
  });

  it("진행 중 주문 없음 → 종료 호출 없이 기존대로 글 변경", async () => {
    const r = await patch({ status, reason: "운영 판단" });
    expect(r.status).toBe(200);
    expect(fake.rpcCalls).toHaveLength(0);
    expect(seq).toEqual([`post.update:${status}`, `audit:community_post.status_${status}`]);
    expect(r.json.promotionEnd).toBeUndefined();
  });

  it("사유 1자 → reason_required · 종료·글 변경 0 (기존 사유 규칙 유지)", async () => {
    promotions = [runningOrder];
    const r = await patch({ status, reason: "x", promotionFault: "operator" });
    expect(r.status).toBe(400);
    expect(r.json.error).toBe("reason_required");
    expect(fake.rpcCalls).toHaveLength(0);
    expect(postUpdated()).toBe(false);
  });
});
