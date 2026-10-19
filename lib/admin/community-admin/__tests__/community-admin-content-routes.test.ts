import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeCommunitySupabase,
  filterValue,
  jsonRequest,
  type FakeCall,
  type FakeResult,
  type FakeRpcCall,
} from "./fake-community-supabase";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
let rpcHandler: (call: FakeRpcCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeCommunitySupabase(
  (c) => handler(c),
  (c) => rpcHandler(c)
);

const audit = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));
const notifyContent = vi.fn(async (..._a: unknown[]) => undefined);
const notifyPinned = vi.fn(async (..._a: unknown[]) => undefined);
const notifyPromotionEnded = vi.fn(async (..._a: unknown[]) => undefined);
const reclaim = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({ ok: true, userId: "admin-1", actor: { userId: "admin-1" }, sb: fake.sb }),
}));
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...a: unknown[]) => audit(...a),
}));
vi.mock("@/lib/notifications/notify-community-moderation", () => ({
  notifyCommunityContentModerated: (...a: unknown[]) => notifyContent(...a),
  notifyCommunityPostPinned: (...a: unknown[]) => notifyPinned(...a),
  notifyCommunityPromotionEnded: (...a: unknown[]) => notifyPromotionEnded(...a),
}));
vi.mock("@/lib/points/community-point-bridge", () => ({
  applyCommunityPointReclaimOnPostAdminRemove: (...a: unknown[]) => reclaim(...a),
  applyCommunityPointReclaimOnModeration: (...a: unknown[]) => reclaim(...a),
}));

import { PATCH as postPatch } from "@/app/api/admin/community/engine/posts/[postId]/route";
import { POST as pinPost } from "@/app/api/admin/community/engine/posts/[postId]/pin/route";
import { PATCH as promoPatch } from "@/app/api/admin/community-promotion-orders/[id]/route";
import { PATCH as commentPatch } from "@/app/api/admin/community/engine/comments/[commentId]/route";

const LOADED = "2026-10-19T01:00:00.123456+00:00";
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
  pinned_at: null,
  updated_at: LOADED,
};

function patchPost(body: Record<string, unknown>) {
  return postPatch(jsonRequest("https://x.test/api/admin/community/engine/posts/post-1", "PATCH", body) as never, {
    params: Promise.resolve({ postId: "post-1" }),
  });
}

/** select(maybeSingle) → before row, update → updated row, promotion list → orders */
function postHandler(opts: {
  before: Record<string, unknown>;
  updated?: Record<string, unknown> | null;
  promotions?: Array<Record<string, unknown>>;
}) {
  return (c: FakeCall): FakeResult => {
    if (c.table === "community_posts" && c.op === "select") return { data: opts.before, error: null };
    if (c.table === "community_posts" && c.op === "update") {
      return {
        data: opts.updated === undefined ? { ...opts.before, ...(c.values as object), updated_at: "2026-10-19T02:00:00.000001+00:00" } : opts.updated,
        error: null,
      };
    }
    if (c.table === "point_promotion_orders") return { data: opts.promotions ?? [], error: null };
    return { data: null, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
  fake.rpcCalls.length = 0;
  rpcHandler = () => ({ data: null, error: null });
});

describe("posts PATCH — CAS · 사유 · 외부 수집 블록 · 홍보 귀책", () => {
  it("400 expected_updated_at_required", async () => {
    handler = postHandler({ before: memberPost });
    const res = await patchPost({ status: "hidden", reason: "스팸 게시물" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_updated_at_required");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("409 conflict with the fresh row when the version on screen is stale", async () => {
    const fresh = { ...memberPost, updated_at: "2026-10-19T03:00:00+00:00", title: "다른 관리자가 수정" };
    handler = postHandler({ before: fresh });
    const res = await patchPost({ status: "hidden", reason: "스팸 게시물", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(409);
    const j = (await res.json()) as { error: string; post: { title: string } };
    expect(j.error).toBe("conflict");
    expect(j.post.title).toBe("다른 관리자가 수정");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("409 conflict when the conditional UPDATE matches 0 rows (race)", async () => {
    handler = postHandler({ before: memberPost, updated: null });
    const res = await patchPost({ status: "hidden", reason: "스팸 게시물", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(409);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(filterValue(upd, "eq", "updated_at")).toBe(LOADED);
    expect(audit).not.toHaveBeenCalled();
  });

  it("400 reason_required for hide and for content edit; restore needs no reason", async () => {
    handler = postHandler({ before: memberPost });
    let res = await patchPost({ status: "hidden", expectedUpdatedAt: LOADED });
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    res = await patchPost({ title: "새 제목", expectedUpdatedAt: LOADED });
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);

    handler = postHandler({ before: { ...memberPost, status: "hidden" } });
    res = await patchPost({ status: "active", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(200);
    expect(notifyContent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "restored" }));
  });

  it("hide sets moderated_*, awaits audit with the old content, notifies the author", async () => {
    handler = postHandler({ before: memberPost });
    const res = await patchPost({ status: "hidden", reason: "스팸 게시물", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(200);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(upd.values).toMatchObject({ status: "hidden", moderated_by: "admin-1", moderation_reason: "스팸 게시물" });
    expect(reclaim).toHaveBeenCalledWith({ postId: "post-1" });
    const auditInput = audit.mock.calls[0]![2] as { before: Record<string, unknown>; action: string };
    expect(auditInput.action).toBe("community_post.status_hidden");
    expect(auditInput.before).toMatchObject({ title: "원래 제목", content: "원래 본문", status: "active" });
    expect(notifyContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "author-1", postId: "post-1", kind: "hidden", reason: "스팸 게시물" })
    );
  });

  it("content edit records the admin as last editor (revision trigger input)", async () => {
    handler = postHandler({ before: memberPost });
    const res = await patchPost({ content: "수정된 본문", reason: "개인정보 가림", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(200);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(upd.values).toMatchObject({
      content: "수정된 본문",
      last_edited_by: "admin-1",
      last_edited_role: "admin",
      last_edit_reason: "개인정보 가림",
    });
    // No updated_at trigger on community_posts: the patch itself must advance the CAS token.
    expect(typeof upd.values.updated_at).toBe("string");
    expect(upd.values.updated_at).not.toBe(LOADED);
    expect(notifyContent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "edited" }));
  });

  it("imported post: content_blocks edit is sanitized and saved; no author notification", async () => {
    handler = postHandler({ before: { ...memberPost, origin_kind: "imported" } });
    const res = await patchPost({
      contentBlocks: [{ t: "p", text: "  첫 문단  " }, { t: "script", text: "x" }, { t: "h", level: 2, text: "제목" }],
      reason: "오탈자 수정",
      expectedUpdatedAt: LOADED,
    });
    expect(res.status).toBe(200);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect((upd.values as { content_blocks: unknown }).content_blocks).toEqual([
      { t: "p", text: "첫 문단" },
      { t: "h", level: 2, text: "제목" },
    ]);
    expect(notifyContent).not.toHaveBeenCalled();
  });

  it("member post: content_blocks edit is refused", async () => {
    handler = postHandler({ before: memberPost });
    const res = await patchPost({ contentBlocks: [{ t: "p", text: "x" }], reason: "수정 사유", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("content_blocks_imported_only");
  });

  it("hiding a post with a running promotion requires promotionFault", async () => {
    handler = postHandler({
      before: memberPost,
      promotions: [{ id: "ord-1", user_id: "buyer-1", order_status: "active", end_at: "2026-10-25T00:00:00Z" }],
    });
    const res = await patchPost({ status: "hidden", reason: "운영 판단", expectedUpdatedAt: LOADED });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error: string; promotions: Array<{ id: string }> };
    expect(j.error).toBe("promotion_fault_required");
    expect(j.promotions[0]!.id).toBe("ord-1");
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("operator fault ends the promotion through the RPC and notifies the buyer with the refund", async () => {
    handler = postHandler({
      before: memberPost,
      promotions: [{ id: "ord-1", user_id: "buyer-1", order_status: "active", end_at: "2026-10-25T00:00:00Z" }],
    });
    rpcHandler = () => ({ data: { ok: true, refund_points: 420, refund_ledger_id: "led-1", has_payment_record: true }, error: null });
    const res = await patchPost({
      status: "deleted",
      reason: "카테고리 정리",
      promotionFault: "operator",
      expectedUpdatedAt: LOADED,
    });
    expect(res.status).toBe(200);
    const rpc = fake.rpcCalls.find((c) => c.fn === "admin_promotion_end")!;
    expect(rpc.args).toMatchObject({
      p_order_id: "ord-1",
      p_actor_id: "admin-1",
      p_reason_code: "post_deleted",
      p_fault: "operator",
      p_preview: false,
    });
    expect(notifyPromotionEnded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "buyer-1", orderId: "ord-1", refundPoints: 420 })
    );
    const j = (await res.json()) as { promotionEnd: Array<{ refundPoints: number }> };
    expect(j.promotionEnd[0]!.refundPoints).toBe(420);
  });
});

describe("pin POST — 고정 한도", () => {
  it("maps pin_limit to 409 with the limit", async () => {
    handler = (c) => (c.table === "community_posts" ? { data: memberPost, error: null } : { data: null, error: null });
    rpcHandler = () => ({ data: { ok: false, error: "pin_limit", limit: 3 }, error: null });
    const res = await pinPost(
      jsonRequest("https://x.test/api/admin/community/engine/posts/post-1/pin", "POST", {
        scope: "feed",
        reason: "운영 안내",
      }) as never,
      { params: Promise.resolve({ postId: "post-1" }) }
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "pin_limit", limit: 3 });
    expect(audit).not.toHaveBeenCalled();
    expect(notifyPinned).not.toHaveBeenCalled();
  });

  it("pins through the RPC, audits and notifies the member author", async () => {
    handler = (c) =>
      c.table === "community_posts" ? { data: { ...memberPost, pinned_at: "2026-10-19T04:00:00Z" }, error: null } : { data: null, error: null };
    rpcHandler = () => ({ data: { ok: true, limit: 2, count: 1 }, error: null });
    const res = await pinPost(
      jsonRequest("https://x.test/api/admin/community/engine/posts/post-1/pin", "POST", {
        scope: "topic",
        reason: "우수 게시글",
        rank: 1,
      }) as never,
      { params: Promise.resolve({ postId: "post-1" }) }
    );
    expect(res.status).toBe(200);
    expect(fake.rpcCalls[0]!.args).toMatchObject({ p_scope: "topic", p_rank: 1, p_actor_id: "admin-1" });
    expect(audit).toHaveBeenCalled();
    expect(notifyPinned).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "author-1" }));
  });
});

describe("community promotion PATCH — 종료 귀책 · 환급 알림 · 레거시 차단", () => {
  const order = { id: "ord-1", domain: "community", user_id: "buyer-1", order_status: "active", end_at: "2026-10-25T00:00:00Z" };
  const call = (body: Record<string, unknown>) =>
    promoPatch(jsonRequest("https://x.test/api/admin/community-promotion-orders/ord-1", "PATCH", body) as never, {
      params: Promise.resolve({ id: "ord-1" }),
    });

  it("410 legacy_flow_disabled for approve/reject", async () => {
    handler = () => ({ data: order, error: null });
    expect((await call({ action: "approve" })).status).toBe(410);
    expect((await call({ action: "reject", reason: "반려 사유" })).status).toBe(410);
    expect(fake.rpcCalls.length).toBe(0);
  });

  it("end requires fault", async () => {
    handler = () => ({ data: order, error: null });
    const res = await call({ action: "end", reason: "정책 위반" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("fault_required");
    expect(fake.rpcCalls.length).toBe(0);
  });

  it("preview returns the refund estimate without notifying", async () => {
    handler = () => ({ data: order, error: null });
    rpcHandler = () => ({
      data: { ok: true, preview: true, refund_points: 300, paid_points: 700, remaining_seconds: 3600, has_payment_record: true },
      error: null,
    });
    const res = await call({ action: "end", fault: "operator", reason: "시스템 오류", preview: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, preview: true, refundPoints: 300, paidPoints: 700 });
    expect(fake.rpcCalls[0]!.args).toMatchObject({ p_preview: true, p_fault: "operator" });
    expect(notifyPromotionEnded).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("end with operator fault notifies the buyer with the refund and audits", async () => {
    handler = () => ({ data: order, error: null });
    rpcHandler = () => ({ data: { ok: true, refund_points: 300, refund_ledger_id: "led-9" }, error: null });
    const res = await call({ action: "end", fault: "operator", reason: "시스템 오류" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, orderStatus: "ended", refundPoints: 300, refundLedgerId: "led-9" });
    expect(fake.rpcCalls[0]!.args).toMatchObject({ p_reason_code: "admin_end", p_preview: false });
    expect(notifyPromotionEnded).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "buyer-1", orderId: "ord-1", refundPoints: 300 })
    );
    expect(audit).toHaveBeenCalled();
  });

  it("pause requires a reason and uses the pause RPC", async () => {
    handler = () => ({ data: order, error: null });
    expect((await call({ action: "pause" })).status).toBe(400);
    rpcHandler = () => ({ data: { ok: true, order_status: "paused", end_at: order.end_at }, error: null });
    const res = await call({ action: "pause", reason: "확인 필요" });
    expect(res.status).toBe(200);
    expect(fake.rpcCalls.map((c) => c.fn)).toEqual(["admin_promotion_pause"]);
  });
});

describe("comment PATCH — 사유 · expectedStatus CAS", () => {
  const comment = { id: "c-1", post_id: "post-1", user_id: "author-2", status: "active", is_hidden: false, is_deleted: false };
  const call = (body: Record<string, unknown>) =>
    commentPatch(jsonRequest("https://x.test/api/admin/community/engine/comments/c-1", "PATCH", body) as never, {
      params: Promise.resolve({ commentId: "c-1" }),
    });

  it("reason required for hide; 409 when status moved", async () => {
    handler = (c) => (c.op === "select" ? { data: comment, error: null } : { data: null, error: null });
    let res = await call({ status: "hidden", expectedStatus: "active" });
    expect(((await res.json()) as { error: string }).error).toBe("reason_required");
    res = await call({ status: "hidden", expectedStatus: "hidden", reason: "욕설" });
    expect(res.status).toBe(409);
    expect(fake.calls.some((c) => c.op === "update")).toBe(false);
  });

  it("hides with moderated_* and notifies the author", async () => {
    handler = (c) =>
      c.op === "select" ? { data: comment, error: null } : { data: { ...comment, status: "hidden" }, error: null };
    const res = await call({ status: "hidden", expectedStatus: "active", reason: "욕설" });
    expect(res.status).toBe(200);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(upd.values).toMatchObject({ status: "hidden", moderated_by: "admin-1", moderation_reason: "욕설" });
    expect(filterValue(upd, "eq", "status")).toBe("active");
    expect(notifyContent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "author-2", postId: "post-1", commentId: "c-1", kind: "hidden" })
    );
  });
});
