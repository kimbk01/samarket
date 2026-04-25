import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePhoneVerified, validateActiveSession } from "@/lib/auth/server-guards";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = new Set([
  "spam",
  "fraud",
  "illegal",
  "harassment",
  "misleading",
  "other",
]);

type PostBody = {
  store_slug?: string;
  target_type?: string;
  product_id?: string | null;
  reason_type?: string;
  message?: string;
};

/**
 * 로그인 사용자: 공개 매장(승인·노출) 또는 해당 매장의 활성 상품에 대한 신고
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;
  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;
  const reporterId = auth.userId;

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const slug = String(body.store_slug ?? "").trim();
  const targetType = String(body.target_type ?? "").trim() as "store" | "product";
  const productIdRaw = body.product_id != null ? String(body.product_id).trim() : "";
  const reasonType = String(body.reason_type ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!slug) {
    return NextResponse.json({ ok: false, error: "missing_store_slug" }, { status: 400 });
  }
  if (targetType !== "store" && targetType !== "product") {
    return NextResponse.json({ ok: false, error: "invalid_target_type" }, { status: 400 });
  }
  if (!REASONS.has(reasonType)) {
    return NextResponse.json({ ok: false, error: "invalid_reason_type" }, { status: 400 });
  }
  if (!message || message.length > 2000) {
    return NextResponse.json({ ok: false, error: "invalid_message" }, { status: 400 });
  }
  if (targetType === "product" && !productIdRaw) {
    return NextResponse.json({ ok: false, error: "missing_product_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select("id, approval_status, is_visible")
    .eq("slug", slug)
    .maybeSingle();

  if (sErr || !store) {
    return NextResponse.json({ ok: false, error: "store_not_found" }, { status: 404 });
  }
  if (store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "store_not_public" }, { status: 404 });
  }

  const storeId = store.id as string;
  let targetId: string;
  if (targetType === "store") {
    targetId = storeId;
  } else {
    const { data: prod, error: pErr } = await sb
      .from("store_products")
      .select("id, store_id, product_status")
      .eq("id", productIdRaw)
      .maybeSingle();
    if (pErr || !prod) {
      return NextResponse.json({ ok: false, error: "product_not_found" }, { status: 404 });
    }
    if ((prod.store_id as string) !== storeId) {
      return NextResponse.json({ ok: false, error: "product_store_mismatch" }, { status: 400 });
    }
    if (prod.product_status !== "active") {
      return NextResponse.json({ ok: false, error: "product_not_active" }, { status: 400 });
    }
    targetId = productIdRaw;
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await sb
    .from("store_reports")
    .select("id")
    .eq("reporter_user_id", reporterId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .gte("created_at", dayAgo)
    .limit(1)
    .maybeSingle();

  if (recent) {
    return NextResponse.json({ ok: false, error: "report_recent_duplicate" }, { status: 409 });
  }

  const { data: row, error: insErr } = await sb
    .from("store_reports")
    .insert({
      reporter_user_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      store_id: storeId,
      reason_type: reasonType,
      message,
      status: "open",
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.message?.includes("store_reports") && insErr.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "store_reports_table_missing" }, { status: 503 });
    }
    console.error("[POST store-reports]", insErr);
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: row?.id });
}
