import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

function isMissingTableError(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("app_notices") && lowered.includes("does not exist");
}

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const noticeId = String(raw ?? "").trim();
  if (!noticeId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("app_notices")
    .select("id, title, body, created_at, is_active, starts_at, ends_at")
    .eq("id", noticeId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row || !row.is_active) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const now = Date.now();
  if (row.starts_at) {
    const t = Date.parse(String(row.starts_at));
    if (Number.isFinite(t) && t > now) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }
  if (row.ends_at) {
    const t = Date.parse(String(row.ends_at));
    if (Number.isFinite(t) && t < now) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  }

  const id = String(row.id);
  return NextResponse.json({
    ok: true,
    notice: {
      id,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? ""),
      href: buildAppNoticeDetailPath(id),
    },
  });
}
