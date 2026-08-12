import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isCustomerCenterContentPublishedNow } from "@/lib/notices/customer-center-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

/** POST — record 1 view / member / content / Seoul-day (not Bell read). */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const contentId = String(raw ?? "").trim();
  if (!contentId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row } = await sb
    .from("app_notices")
    .select("id, is_active, starts_at, ends_at, archived_at, deleted_at, view_count")
    .eq("id", contentId)
    .maybeSingle();

  if (!row || !isCustomerCenterContentPublishedNow(row)) {
    return NextResponse.json({ ok: true, recorded: false, viewCount: Number(row?.view_count) || 0 });
  }

  const { data, error } = await sb.rpc("record_customer_center_content_view", {
    p_content_id: contentId,
    p_user_id: auth.userId,
  });

  if (error) {
    // Migration not applied yet — soft fail; do not invent client-side views.
    return NextResponse.json({
      ok: true,
      recorded: false,
      viewCount: Number(row.view_count) || 0,
      hint: error.message,
    });
  }

  const first = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    recorded: Boolean(first?.recorded),
    viewCount: Number(first?.view_count ?? row.view_count) || 0,
  });
}
