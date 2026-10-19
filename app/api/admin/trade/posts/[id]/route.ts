import { NextRequest, NextResponse } from "next/server";
import { requireTradeAdmin } from "@/lib/admin/trade-admin/trade-admin-guards";
import {
  callTradeAdminRpc,
  notifyTradePostOwnerAfterAdminAction,
  readJsonBody,
  tradeAuditMetaArgs,
} from "@/lib/admin/trade-admin/trade-admin-rpc";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { communityAdminUuidOrNull } from "@/lib/admin/community-admin/community-admin-period";
import { resolveTradePostLguIds, TRADE_ADMIN_OPEN_REPORT_STATUSES } from "@/lib/admin/trade-admin/trade-posts-query";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DETAIL_SELECT =
  "id, user_id, title, content, price, is_free_share, is_price_offer, images, thumbnail_url, status, seller_listing_state, " +
  "moderation_state, owner_state, moderation_reason, moderation_by, moderation_at, owner_state_at, region, city, trade_lgu_id, " +
  "trade_category_id, trade_type, view_count, favorite_count, chat_count, sold_buyer_id, reserved_buyer_id, meta, created_at, updated_at";

/** GET /api/admin/trade/posts/[id] — 게시물 상세 + 관련 이력 (설계 v2 §C-3) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const sb = admin.sb;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });

  const { data: post, error } = await sb.from("posts").select(DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!post) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const p = post as unknown as Record<string, unknown>;

  const soldBuyer = p.sold_buyer_id ? String(p.sold_buyer_id) : null;
  const [revs, audits, reps, promos, rooms, completion, cat, lguByPost] = await Promise.all([
    sb
      .from("trade_post_revisions")
      .select("id, editor_id, before_json, after_json, reason, created_at")
      .eq("post_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("audit_logs")
      .select("id, actor_id, actor_type, action, before_json, after_json, created_at")
      .in("target_type", ["trade_post", "post"])
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("reports")
      .select("id, reporter_id, reason_code, reason_text, status, created_at, resolved_at")
      .or(`product_id.eq.${id},target_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("point_promotion_orders")
      .select("id, order_status, placement, point_cost, start_at, end_at, created_at")
      .eq("domain", "trade")
      .eq("target_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("chat_rooms")
      .select("id, buyer_id, seller_id, trade_status, last_message_at, created_at")
      .eq("room_type", "item_trade")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    // 거래 완료 시각 = 판매자 완료 처리 시각 (product_chats.seller_completed_at). 없으면 만들지 않는다.
    soldBuyer
      ? sb
          .from("product_chats")
          .select("seller_completed_at, buyer_confirmed_at")
          .eq("post_id", id)
          .eq("buyer_id", soldBuyer)
          .not("seller_completed_at", "is", null)
          .order("seller_completed_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    p.trade_category_id
      ? sb.from("categories").select("id, name, is_active").eq("id", String(p.trade_category_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    resolveTradePostLguIds(sb, [p as { id: unknown }]),
  ]);

  const lguId = lguByPost.get(id) ?? null;
  const lgu = lguId
    ? (await sb.from("trade_national_lgu").select("display_name, province_name").eq("canonical_id", lguId).maybeSingle())
        .data
    : null;

  const revRows = (revs.data ?? []) as Record<string, unknown>[];
  const auditRows = (audits.data ?? []) as Record<string, unknown>[];
  const repRows = (reps.data ?? []) as Record<string, unknown>[];
  const roomRows = (rooms.data ?? []) as Record<string, unknown>[];
  const identities = await loadAdminMemberIdentityMap(sb, [
    String(p.user_id ?? ""),
    soldBuyer ?? "",
    String(p.reserved_buyer_id ?? ""),
    String(p.moderation_by ?? ""),
    ...revRows.map((r) => String(r.editor_id ?? "")),
    ...auditRows.map((r) => String(r.actor_id ?? "")),
    ...repRows.map((r) => String(r.reporter_id ?? "")),
    ...roomRows.map((r) => String(r.buyer_id ?? "")),
  ]);
  const label = (uid: unknown) => (uid ? formatAdminMemberLabel(identities.get(String(uid))) : null);
  const comp = (completion.data ?? null) as { seller_completed_at?: string | null } | null;

  return NextResponse.json({
    ok: true,
    post: {
      ...p,
      seller_label: label(p.user_id),
      sold_buyer_label: label(soldBuyer),
      reserved_buyer_label: label(p.reserved_buyer_id),
      moderation_by_label: label(p.moderation_by),
      category_name: (cat.data as { name?: string } | null)?.name ?? null,
      lgu_id: lguId,
      region_label: (lgu as { display_name?: string } | null)?.display_name ?? null,
      completed_at: comp?.seller_completed_at ?? null,
    },
    revisions: revRows.map((r) => ({ ...r, editor_label: label(r.editor_id) })),
    audits: auditRows.map((r) => ({ ...r, actor_label: r.actor_type === "system" ? "시스템" : label(r.actor_id) })),
    reports: repRows.map((r) => ({
      ...r,
      reporter_label: label(r.reporter_id),
      is_open: (TRADE_ADMIN_OPEN_REPORT_STATUSES as readonly string[]).includes(String(r.status)),
    })),
    promotions: promos.data ?? [],
    rooms: roomRows.map((r) => ({ ...r, buyer_label: label(r.buyer_id) })),
  });
}

/**
 * PATCH /api/admin/trade/posts/[id] — 관리자 내용 수정 (설계 v2 §F-1-3)
 * body: { patch: { title?, content?, price?, trade_category_id?, images?, thumbnail_url?, is_price_offer?, is_free_share? },
 *         reason, expectedUpdatedAt }
 * 수정 전 값은 trade_post_revisions, 처리 기록은 audit_logs — 같은 트랜잭션.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireTradeAdmin();
  if (!admin.ok) return admin.response;
  const id = communityAdminUuidOrNull((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const body = await readJsonBody(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!expected) return NextResponse.json({ ok: false, error: "expected_updated_at_required" }, { status: 400 });
  const patch = body.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  const res = await callTradeAdminRpc(admin.sb, "admin_trade_post_edit", {
    p_post_id: id,
    p_actor_id: admin.userId,
    p_patch: patch,
    p_reason: reason,
    p_expected_updated_at: expected,
    ...tradeAuditMetaArgs(req),
  });
  if (!res.ok) return res.response;
  const notified = await notifyTradePostOwnerAfterAdminAction(admin.sb, {
    postId: id,
    kind: "edited",
    reason,
    dedupeId: `edit:${String(res.data.updated_at ?? Date.now())}`,
  });
  return NextResponse.json({ ok: true, updatedAt: res.data.updated_at ?? null, ...(notified ? {} : { sideEffectWarning: true }) });
}
