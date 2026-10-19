import { type NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampLimit(raw: string | null, fallback: number) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(300, Math.max(1, n));
}

/** 관리자: 결제 수신 기록 (쿼리: order_id · source · event_type 정확히 일치, limit) — 조회 전용 */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id")?.trim() || null;
  const sourceRaw = searchParams.get("source")?.trim() || null;
  const eventRaw = searchParams.get("event_type")?.trim() || null;
  const limit = clampLimit(searchParams.get("limit"), 200);
  if (orderId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return NextResponse.json({ ok: false, error: "invalid_order_id" }, { status: 400 });
  }

  let q = sb
    .from("store_payment_events")
    .select("id, source, order_id, event_type, provider, transmission_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  // Admin screen sends exact values from its select boxes (labels are mapped in the UI).
  if (orderId) q = q.eq("order_id", orderId);
  if (sourceRaw) q = q.eq("source", sourceRaw.slice(0, 80));
  if (eventRaw) q = q.eq("event_type", eventRaw.slice(0, 80));

  const { data: rows, error } = await q;

  if (error) {
    if (error.message?.includes("store_payment_events") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/store-payment-events]", error);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: rows ?? [] });
}
