import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/me/stores/[storeId]/platform-inquiries — A2-1: new writer disabled (use Support Center). */
export async function POST(
  _req: NextRequest,
  _context: { params: Promise<{ storeId: string }> }
) {
  return NextResponse.json(
    {
      ok: false,
      error: "legacy_writer_disabled",
      message: "Use Support Center (support_cases) for new owner→admin inquiries.",
    },
    { status: 410 }
  );
}

/** GET — 오너: 본인 매장 플랫폼 문의 목록 (legacy archive read-only). */
export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getCachedStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data, error } = await sb
    .from("platform_admin_inquiries")
    .select(
      "id, inquiry_type, inquiry_kind, subject, content, status, answer, answered_at, created_at"
    )
    .eq("store_id", sid)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (/platform_admin_inquiries/i.test(error.message)) {
      return NextResponse.json({ ok: true, inquiries: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inquiries: data ?? [] });
}
