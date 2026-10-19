import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  COMMUNITY_POST_PIN_CLEAR_PATCH,
  parseCommunityPinScope,
  setCommunityPostPin,
} from "@/lib/admin/community-admin/community-post-pin";
import { notifyCommunityPostPinned } from "@/lib/notifications/notify-community-moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_ROW_SELECT =
  "id, user_id, origin_kind, status, topic_id, is_notice, pinned_at, pinned_until, pinned_by, pin_scope, pin_rank, pin_reason, updated_at";

type Ctx = { params: Promise<{ postId: string }> };

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const j = (await req.json()) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/admin/community/engine/posts/:postId/pin
 * body: { scope: 'feed'|'topic', until?: ISO|null, rank?: number, reason: string }
 * → 200 { ok, limit, count, post } · 409 { error:'pin_limit', limit } · 409 not_active · 400 no_topic|invalid_until|reason_required
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;
  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const body = await readJson(req);
  if (!body) return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  const scope = parseCommunityPinScope(body.scope);
  if (!scope) return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  let until: string | null = null;
  if (typeof body.until === "string" && body.until.trim()) {
    const t = Date.parse(body.until);
    if (Number.isNaN(t)) return NextResponse.json({ ok: false, error: "invalid_until" }, { status: 400 });
    until = new Date(t).toISOString();
  }
  const rankRaw = Number(body.rank ?? 0);
  const rank = Number.isFinite(rankRaw) ? Math.max(0, Math.min(100, Math.floor(rankRaw))) : 0;

  const { data: before } = await sb.from("community_posts").select(PIN_ROW_SELECT).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const res = await setCommunityPostPin(sb, { postId: id, actorId: admin.userId, scope, until, rank, reason });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, ...(res.limit != null ? { limit: res.limit } : {}) },
      { status: res.httpStatus }
    );
  }

  const { data: after } = await sb.from("community_posts").select(PIN_ROW_SELECT).eq("id", id).maybeSingle();
  const b = before as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_post",
    targetId: id,
    action: "community_post.pin",
    reason,
    before: {
      pinned_at: b.pinned_at ?? null,
      pinned_until: b.pinned_until ?? null,
      pin_scope: b.pin_scope ?? null,
      pin_rank: b.pin_rank ?? 0,
    },
    after: { scope, until, rank, limit: res.limit, count: res.count, pinned_at: a.pinned_at ?? null },
  });

  if (b.origin_kind !== "imported" && b.origin_kind !== "admin" && b.is_notice !== true) {
    try {
      await notifyCommunityPostPinned(sb, {
        userId: String(b.user_id ?? ""),
        postId: id,
        pinnedAt: String(a.pinned_at ?? new Date().toISOString()),
      });
    } catch (e) {
      console.error("[admin post pin] notify", e);
    }
  }

  return NextResponse.json({ ok: true, limit: res.limit, count: res.count, post: after ?? null, auditOk: audit.ok });
}

/**
 * DELETE /api/admin/community/engine/posts/:postId/pin
 * body: { reason?: string } → 200 { ok, post, unchanged? }
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;
  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const body = (await readJson(req)) ?? {};
  const reason = normalizeCommunityAdminReason(body.reason);

  const { data: before } = await sb.from("community_posts").select(PIN_ROW_SELECT).eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const b = before as Record<string, unknown>;
  if (!b.pinned_at) return NextResponse.json({ ok: true, post: before, unchanged: true });

  const { data: after, error } = await sb
    .from("community_posts")
    .update({ ...COMMUNITY_POST_PIN_CLEAR_PATCH })
    .eq("id", id)
    .not("pinned_at", "is", null)
    .select(PIN_ROW_SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!after) {
    const { data: fresh } = await sb.from("community_posts").select(PIN_ROW_SELECT).eq("id", id).maybeSingle();
    return NextResponse.json({ ok: true, post: fresh ?? null, unchanged: true });
  }

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: admin.userId,
    targetType: "community_post",
    targetId: id,
    action: "community_post.unpin",
    reason,
    before: {
      pinned_at: b.pinned_at ?? null,
      pinned_until: b.pinned_until ?? null,
      pinned_by: b.pinned_by ?? null,
      pin_scope: b.pin_scope ?? null,
      pin_rank: b.pin_rank ?? 0,
      pin_reason: b.pin_reason ?? null,
    },
    after: { ...COMMUNITY_POST_PIN_CLEAR_PATCH },
  });

  return NextResponse.json({ ok: true, post: after, auditOk: audit.ok });
}
