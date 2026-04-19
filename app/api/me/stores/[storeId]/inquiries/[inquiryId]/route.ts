import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = { answer?: string; close_only?: boolean };

/** 오너: 문의 답변 또는 종료 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; inquiryId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { storeId, inquiryId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const iid = typeof inquiryId === "string" ? inquiryId.trim() : "";
  if (!sid || !iid) {
    return NextResponse.json({ ok: false, error: "missing_ids" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const { data: row, error: qErr } = await sb
    .from("store_inquiries")
    .select("id, store_id, status")
    .eq("id", iid)
    .eq("store_id", sid)
    .maybeSingle();

  if (qErr || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const closeOnly = body.close_only === true;
  const answer = String(body.answer ?? "").trim();

  if (closeOnly) {
    if (row.status === "closed") {
      return NextResponse.json({ ok: true, status: "closed" });
    }
    const { error: uErr } = await sb
      .from("store_inquiries")
      .update({ status: "closed" })
      .eq("id", iid)
      .eq("store_id", sid);
    if (uErr) {
      return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: "closed" });
  }

  if (!answer || answer.length > 8000) {
    return NextResponse.json({ ok: false, error: "answer_required" }, { status: 400 });
  }

  const { error: uErr } = await sb
    .from("store_inquiries")
    .update({
      answer,
      status: "answered",
      answered_by_user_id: userId,
      answered_at: new Date().toISOString(),
    })
    .eq("id", iid)
    .eq("store_id", sid);

  if (uErr) {
    console.error("[PATCH inquiry]", uErr);
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "answered" });
}
