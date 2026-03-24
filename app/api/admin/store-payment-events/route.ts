import { type NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

function clampLimit(raw: string | null, fallback: number) {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(300, Math.max(1, n));
}

/** 관리자: 결제·웹훅 이벤트 로그 (쿼리: order_id, source, event_type, limit) */
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

  /** ilike 패턴 특수문자 제거 (와일드카드 주입 방지) */
  const safeIlike = (s: string) => s.replace(/[%_\\]/g, "");

  let q = sb
    .from("store_payment_events")
    .select("id, source, order_id, event_type, provider, transmission_id, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (orderId) q = q.eq("order_id", orderId);
  const source = sourceRaw ? safeIlike(sourceRaw) : "";
  if (source) q = q.ilike("source", `%${source}%`);
  const eventType = eventRaw ? safeIlike(eventRaw) : "";
  if (eventType) q = q.ilike("event_type", `%${eventType}%`);

  const { data: rows, error } = await q;

  if (error) {
    if (error.message?.includes("store_payment_events") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/store-payment-events]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: rows ?? [] });
}
