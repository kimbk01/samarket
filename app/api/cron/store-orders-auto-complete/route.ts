import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { notifyBuyerStoreOrderAutoCompleted } from "@/lib/notifications/notify-store-commerce";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

/**
 * 자동 구매확정: paid + (픽업준비·픽업 주문 | 배송지도착 | 구버전 배송중) + auto_complete_at <= now → completed
 *
 * 인증: Authorization: Bearer <CRON_SECRET> 또는 x-cron-secret
 * Vercel Cron은 GET으로 호출되며, 프로젝트에 CRON_SECRET이 있으면 같은 값이 Bearer로 전달됩니다.
 */
async function runStoreOrdersAutoComplete(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }

  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const now = new Date().toISOString();

  const { data: due, error } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, order_no, store_id")
    .eq("payment_status", "paid")
    .in("order_status", ["ready_for_pickup", "delivering", "arrived"])
    .not("auto_complete_at", "is", null)
    .lte("auto_complete_at", now);

  if (error) {
    if (error.message?.includes("auto_complete_at") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "column_missing_apply_migration" }, { status: 503 });
    }
    console.error("[cron store-orders-auto-complete]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (due ?? []).map((r) => r.id as string).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, completed: 0, order_ids: [] });
  }

  const { error: uErr } = await sb
    .from("store_orders")
    .update({ order_status: "completed", auto_complete_at: null })
    .in("id", ids);

  if (uErr) {
    console.error("[cron store-orders-auto-complete update]", uErr);
    return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
  }

  for (const row of due ?? []) {
    const id = row.id as string;
    const bid = row.buyer_user_id as string | undefined;
    if (bid) {
      void notifyBuyerStoreOrderAutoCompleted(sb, {
        buyerUserId: bid,
        orderId: id,
        orderNo: String(row.order_no ?? ""),
        storeId: row.store_id as string,
      });
    }
  }

  const rm = getAuditRequestMeta(req);
  const idSample = ids.slice(0, 80);
  void appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "cron_job",
    target_id: "store-orders-auto-complete",
    action: "store_order.cron_auto_complete",
    after_json: {
      completed_count: ids.length,
      order_ids: idSample,
      truncated: ids.length > idSample.length,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, completed: ids.length, order_ids: ids });
}

export async function GET(req: Request) {
  return runStoreOrdersAutoComplete(req);
}

export async function POST(req: Request) {
  return runStoreOrdersAutoComplete(req);
}
