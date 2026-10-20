
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/posts/bulk-delete — 거래글 영구 삭제 (설계 v2 §F-1-4 · O-3 기본안)
 * body: { ids: string[], reason, surface? }
 *
 * - 최고 관리자 전용. 관리 화면에서는 노출하지 않는다 (일반 삭제 = 관리자 삭제 상태).
 * - 관리자 삭제 상태이면서 신고·거래 채팅·홍보·판매 확정 기록이 하나도 없는 글만 (증거 보존).
 * - 감사 기록을 먼저 남기고, 기록에 실패하면 삭제하지 않는다.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  collectPostRowImageUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";
import {
  evaluateTradePostHardDeleteEligibility,
  type TradePostHardDeleteBlocker,
} from "@/lib/admin-posts/trade-post-hard-delete-eligibility";

const MAX_BATCH = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TRADE_SURFACES = new Set(["trade_admin", "posts_management", "product_cc"]);

function parseIds(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { ids?: unknown }).ids;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || !UUID_RE.test(id)) continue;
    out.push(id);
  }
  const uniq = [...new Set(out)];
  return uniq.length ? uniq : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin();
  if (!admin.ok) return admin.response;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const surface =
    json && typeof json === "object" && "surface" in json
      ? String((json as { surface?: unknown }).surface ?? "").trim().toLowerCase()
      : "";

  const ids = parseIds(json);
  if (!ids) {
    return NextResponse.json({ ok: false, error: "ids: uuid[] 필요" }, { status: 400 });
  }
  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `한 번에 최대 ${MAX_BATCH}개까지 삭제할 수 있습니다.` },
      { status: 400 }
    );
  }

  const reason = normalizeCommunityAdminReason(
    json && typeof json === "object" ? (json as { reason?: unknown }).reason : null
  );
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

  const sb = admin.sb;
  const { data: rowsBefore, error: loadErr } = await sb
    .from("posts")
    .select("id, user_id, title, images, thumbnail_url, status, sold_buyer_id, moderation_state")
    .in("id", ids);

  if (loadErr) {
    return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  }

  type Row = {
    id: string;
    images?: unknown;
    thumbnail_url?: unknown;
    status?: string | null;
    sold_buyer_id?: string | null;
    moderation_state?: string | null;
  };

  const countBy = async (table: string, col: string, extra?: (q: any) => any): Promise<Map<string, number>> => {
    const m = new Map<string, number>();
    let q = (sb as any).from(table).select(col).in(col, ids);
    if (extra) q = extra(q);
    const { data } = await q.limit(5000);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const k = String(r[col] ?? "");
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const [repByProduct, repByTarget, roomsByItem, pcByPost, promoByTarget] = await Promise.all([
    countBy("reports", "product_id"),
    countBy("reports", "target_id"),
    countBy("chat_rooms", "item_id"),
    countBy("product_chats", "post_id"),
    countBy("point_promotion_orders", "target_id"),
  ]);

  const byId = new Map((rowsBefore ?? []).map((r) => [String((r as Row).id), r as Row]));
  const blocked: { id: string; blockers: TradePostHardDeleteBlocker[] }[] = [];
  const eligibleIds: string[] = [];

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      blocked.push({ id, blockers: ["invalid_id"] });
      continue;
    }
    const ev = evaluateTradePostHardDeleteEligibility({
      id,
      status: row.status,
      soldBuyerId: row.sold_buyer_id,
      moderationState: row.moderation_state ?? null,
      reportCount: (repByProduct.get(id) ?? 0) + (repByTarget.get(id) ?? 0),
      chatCount: (roomsByItem.get(id) ?? 0) + (pcByPost.get(id) ?? 0),
      promotionCount: promoByTarget.get(id) ?? 0,
    });
    if (!ev.eligible) blocked.push({ id, blockers: ev.blockers });
    else eligibleIds.push(id);
  }

  // Non-trade legacy callers: still delete only eligible rows (same safety).
  void TRADE_SURFACES;
  void surface;

  if (eligibleIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: [],
      deletedCount: 0,
      notFoundOrSkipped: ids,
      blocked,
      message: "no_eligible_rows",
    });
  }

  const imageUrlsToRemove: string[] = [];
  for (const id of eligibleIds) {
    const row = byId.get(id);
    if (!row) continue;
    imageUrlsToRemove.push(
      ...collectPostRowImageUrls(row as { images?: unknown; thumbnail_url?: unknown })
    );
  }

  // 감사 기록 먼저 — 실패하면 삭제하지 않는다 (복구 불가 작업)
  for (const id of eligibleIds) {
    const row = byId.get(id) as (Row & { user_id?: string | null; title?: string | null }) | undefined;
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.actor.userId,
      targetType: "trade_post",
      targetId: id,
      action: "trade_post.hard_delete",
      reason,
      before: { user_id: row?.user_id ?? null, title: row?.title ?? null, status: row?.status ?? null },
    });
    if (!audit.ok) {
      return NextResponse.json({ ok: false, error: "audit_failed" }, { status: 500 });
    }
  }

  const { error, data } = await sb
    .from("posts")
    .delete()
    .in("id", eligibleIds)
    .select("id");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const deleted = (data ?? []).map((r: { id: string }) => r.id);
  const deletedSet = new Set(deleted);
  const missing = eligibleIds.filter((id) => !deletedSet.has(id));

  if (deleted.length > 0 && imageUrlsToRemove.length > 0) {
    const removal = await removeCanonicalImagesFromPublicUrls({
      sb,
      urls: imageUrlsToRemove,
      context: "admin/posts/bulk-delete",
    });
    if (removal.failed.length > 0) {
      console.error("[admin/posts/bulk-delete] storage cleanup partial failure", removal.failed);
    }
  }

  return NextResponse.json({
    ok: true,
    deleted,
    deletedCount: deleted.length,
    notFoundOrSkipped: missing,
    blocked,
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
