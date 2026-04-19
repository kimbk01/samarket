import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = { reply?: string };

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; reviewId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId, reviewId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const rid = typeof reviewId === "string" ? reviewId.trim() : "";
  if (!sid || !rid) {
    return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const reply = String(body.reply ?? "").trim();
  if (!reply || reply.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_reply" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: row, error: getErr } = await sb
    .from("store_reviews")
    .select("id, store_id")
    .eq("id", rid)
    .eq("store_id", sid)
    .maybeSingle();

  if (getErr || !row) {
    return NextResponse.json({ ok: false, error: "review_not_found" }, { status: 404 });
  }

  const { error: upErr } = await sb
    .from("store_reviews")
    .update({
      owner_reply_content: reply,
      owner_reply_created_at: new Date().toISOString(),
      owner_reply_owner_user_id: userId,
    })
    .eq("id", rid)
    .eq("store_id", sid);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
