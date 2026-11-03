export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F2 거래 글 「이 글 숨기기」 저장 — PUT 숨김 · DELETE 되돌리기 (둘 다 멈춤 없이 여러 번 보내도 같은 결과).
 * 본인 행만(`user_id = 세션`). 표가 아직 없으면 503 `migration_required` — 화면은 기기 메모리로 동작.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";

const TABLE = "trade_post_user_hides";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolve(ctx: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return { error: auth.response } as const;
  const { postId } = await ctx.params;
  const id = String(postId ?? "").trim();
  if (!UUID_RE.test(id)) return { error: NextResponse.json({ ok: false, error: "invalid_post_id" }, { status: 400 }) } as const;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return { error: NextResponse.json({ ok: false, error: "server_config" }, { status: 500 }) } as const;
  return { sb, userId: auth.userId, postId: id } as const;
}

function failure(message: string) {
  if (isMissingPointsTable(message, TABLE)) {
    return NextResponse.json({ ok: false, error: "migration_required" }, { status: 503 });
  }
  return NextResponse.json({ ok: false, error: "hide_save_failed" }, { status: 500 });
}

export async function PUT(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const { error } = await r.sb
    .from(TABLE)
    .upsert({ post_id: r.postId, user_id: r.userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
  if (error) {
    /** 없는 글(지워짐) — 숨길 대상이 없으니 그대로 성공 처리하지 않고 알린다 */
    if (error.code === "23503") return NextResponse.json({ ok: false, error: "post_not_found" }, { status: 404 });
    return failure(error.message ?? "");
  }
  return NextResponse.json({ ok: true, hidden: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  const { error } = await r.sb.from(TABLE).delete().eq("post_id", r.postId).eq("user_id", r.userId);
  if (error) return failure(error.message ?? "");
  return NextResponse.json({ ok: true, hidden: false });
}
