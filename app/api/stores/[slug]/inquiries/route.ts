import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["product", "order", "store", "complaint"]);

/** 공개 매장에 문의 등록 (로그인 필요, 본인 매장 제외) */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  let body: { subject?: string; content?: string; inquiry_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!subject || !content) {
    return NextResponse.json({ ok: false, error: "subject_and_content_required" }, { status: 400 });
  }
  if (subject.length > 200 || content.length > 8000) {
    return NextResponse.json({ ok: false, error: "text_too_long" }, { status: 400 });
  }

  const rawType = String(body.inquiry_type ?? "store").trim();
  const inquiry_type = TYPES.has(rawType) ? rawType : "store";

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const access = await assertVerifiedMemberForAction(sb as any, userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, is_visible")
    .eq("slug", decoded)
    .maybeSingle();

  if (sErr || !store || store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }

  if (store.owner_user_id === userId) {
    return NextResponse.json({ ok: false, error: "cannot_inquire_own_store" }, { status: 400 });
  }

  const { data: row, error: insErr } = await sb
    .from("store_inquiries")
    .insert({
      store_id: store.id,
      from_user_id: userId,
      inquiry_type,
      subject,
      content,
      status: "open",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.message?.includes("store_inquiries") && insErr.message?.includes("does not exist")) {
      return NextResponse.json(
        { ok: false, error: "store_inquiries_table_missing" },
        { status: 503 }
      );
    }
    console.error("[POST store inquiry]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: row?.id });
}
