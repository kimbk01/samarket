import { POSTS_TABLE_READ, POSTS_TABLE_WRITE } from "@/lib/posts/posts-db-tables";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["active", "reserved", "sold", "hidden", "deleted"]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveSoldBuyerId(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  postId: string,
  before: { sold_buyer_id?: string | null; reserved_buyer_id?: string | null },
  requested: string | null
): Promise<{ buyerId: string | null; error?: string }> {
  if (requested) {
    if (!UUID_RE.test(requested)) {
      return { buyerId: null, error: "soldBuyerId는 UUID여야 합니다." };
    }
    return { buyerId: requested };
  }
  const existingSold =
    typeof before.sold_buyer_id === "string" && before.sold_buyer_id.trim()
      ? before.sold_buyer_id.trim()
      : "";
  if (existingSold) return { buyerId: existingSold };

  const reserved =
    typeof before.reserved_buyer_id === "string" && before.reserved_buyer_id.trim()
      ? before.reserved_buyer_id.trim()
      : "";
  if (reserved) return { buyerId: reserved };

  const { data: chats, error } = await sb
    .from("product_chats")
    .select("buyer_id")
    .eq("post_id", postId)
    .limit(50);
  if (error) return { buyerId: null, error: error.message };

  const ids = [
    ...new Set(
      (Array.isArray(chats) ? chats : [])
        .map((r: { buyer_id?: string | null }) =>
          typeof r.buyer_id === "string" ? r.buyer_id.trim() : ""
        )
        .filter(Boolean)
    ),
  ];
  if (ids.length === 1) return { buyerId: ids[0]! };
  if (ids.length === 0) {
    return {
      buyerId: null,
      error:
        "판매 확정 구매자가 없습니다. 거래 채팅 구매자를 지정하거나 reserved/sold buyer가 필요합니다.",
    };
  }
  return {
    buyerId: null,
    error: `구매자 후보가 ${ids.length}명입니다. soldBuyerId를 지정하세요.`,
  };
}

/**
 * POST /api/admin/posts/[postId]/status
 * body: { status, reason?, soldBuyerId? }
 * Soft moderation + audit. status=sold requires resolvable sold_buyer_id (L4).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { postId: rawId } = await params;
  const postId = typeof rawId === "string" ? rawId.trim() : "";
  if (!postId) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }

  let body: { status?: string; reason?: string | null; soldBuyerId?: string | null };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const status = typeof body.status === "string" ? body.status.trim() : "";
  if (!ALLOWED.has(status)) {
    return NextResponse.json(
      { ok: false, error: "status는 active|reserved|sold|hidden|deleted" },
      { status: 400 }
    );
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : null;
  const soldBuyerRequested =
    typeof body.soldBuyerId === "string" && body.soldBuyerId.trim()
      ? body.soldBuyerId.trim()
      : null;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  // Prod may lack posts.visibility — never fail the whole writer on SELECT column miss (S3 closeout).
  const selectFull =
    "id, status, visibility, title, sold_buyer_id, reserved_buyer_id, seller_listing_state";
  const selectNoVis =
    "id, status, title, sold_buyer_id, reserved_buyer_id, seller_listing_state";
  let before: Record<string, unknown> | null = null;
  {
    const first = await sb.from(POSTS_TABLE_READ).select(selectFull).eq("id", postId).maybeSingle();
    if (first.error && /visibility|column|42703/i.test(String(first.error.message))) {
      const second = await sb.from(POSTS_TABLE_READ).select(selectNoVis).eq("id", postId).maybeSingle();
      if (second.error) {
        return NextResponse.json({ ok: false, error: second.error.message }, { status: 500 });
      }
      before = (second.data as Record<string, unknown> | null) ?? null;
    } else if (first.error) {
      return NextResponse.json({ ok: false, error: first.error.message }, { status: 500 });
    } else {
      before = (first.data as Record<string, unknown> | null) ?? null;
    }
  }

  if (!before) {
    return NextResponse.json({ ok: false, error: "게시물을 찾을 수 없습니다." }, { status: 404 });
  }

  const nextVisibility = status === "hidden" || status === "deleted" ? "hidden" : "public";
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    visibility: nextVisibility,
    updated_at: now,
  };

  // Cut A / S4 — keep LISTING_OPS (posts.status) and SELLER_STAGE (seller_listing_state) aligned.
  if (status === "active") {
    patch.seller_listing_state = "inquiry";
  } else if (status === "reserved") {
    patch.seller_listing_state = "reserved";
  }

  let resolvedSoldBuyer: string | null = null;
  if (status === "sold") {
    const resolved = await resolveSoldBuyerId(
      sb,
      postId,
      before as { sold_buyer_id?: string | null; reserved_buyer_id?: string | null },
      soldBuyerRequested
    );
    if (!resolved.buyerId) {
      return NextResponse.json(
        { ok: false, error: resolved.error ?? "sold_buyer_id 필요", code: "need_sold_buyer" },
        { status: 400 }
      );
    }
    resolvedSoldBuyer = resolved.buyerId;
    patch.sold_buyer_id = resolvedSoldBuyer;
    patch.seller_listing_state = "completed";
    patch.reserved_buyer_id = null;
  }

  let { error: writeErr } = await sb.from(POSTS_TABLE_WRITE).update(patch).eq("id", postId);
  if (writeErr && /visibility|sold_buyer|reserved_buyer|seller_listing|column/i.test(String(writeErr.message))) {
    const rest = { ...patch };
    if (/visibility/i.test(String(writeErr.message))) delete rest.visibility;
    if (/sold_buyer/i.test(String(writeErr.message))) delete rest.sold_buyer_id;
    if (/reserved_buyer/i.test(String(writeErr.message))) delete rest.reserved_buyer_id;
    if (/seller_listing/i.test(String(writeErr.message))) delete rest.seller_listing_state;
    writeErr = (await sb.from(POSTS_TABLE_WRITE).update(rest).eq("id", postId)).error;
  }
  if (writeErr) {
    return NextResponse.json({ ok: false, error: writeErr.message }, { status: 500 });
  }

  const beforeStatus = (before as { status?: string }).status ?? null;
  const action =
    status === "hidden"
      ? "post.hide"
      : status === "deleted"
        ? "post.soft_delete"
        : status === "active" && beforeStatus === "hidden"
          ? "post.restore"
          : status === "sold"
            ? "post.mark_sold"
            : `post.status.${status}`;

  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: admin.userId,
    target_type: "post",
    target_id: postId,
    action,
    before_json: {
      status: beforeStatus,
      visibility: (before as { visibility?: string }).visibility ?? null,
      title: (before as { title?: string }).title ?? null,
      sold_buyer_id: (before as { sold_buyer_id?: string | null }).sold_buyer_id ?? null,
    },
    after_json: {
      status,
      visibility: nextVisibility,
      reason,
      sold_buyer_id: resolvedSoldBuyer,
    },
  });

  return NextResponse.json({ ok: true, soldBuyerId: resolvedSoldBuyer });
}
