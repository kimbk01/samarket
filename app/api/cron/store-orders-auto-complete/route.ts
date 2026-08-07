import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 자동 구매확정 — status write는 applyStoreOrderStatusTransition(SYSTEM)만.
 * Pickup: ready_for_pickup + auto_complete_at due
 * Delivery: arrived + auto_complete_at due
 * (legacy delivering→completed cron edge 제거 — Phase 6A)
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
    .select("id, store_id, order_status, fulfillment_type")
    .eq("payment_status", "paid")
    .in("order_status", ["ready_for_pickup", "arrived"])
    .not("auto_complete_at", "is", null)
    .lte("auto_complete_at", now);

  if (error) {
    if (error.message?.includes("auto_complete_at") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "column_missing_apply_migration" }, { status: 503 });
    }
    console.error("[cron store-orders-auto-complete]", error);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(error.message) },
      { status: 500 }
    );
  }

  const completedIds: string[] = [];
  const rm = getAuditRequestMeta(req);

  for (const row of due ?? []) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;

    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: id,
      nextStatus: "completed",
      actor: "SYSTEM",
      requireAutoCompleteDue: true,
      systemPurpose: "auto_complete",
      audit: {
        actor_type: "system",
        actor_id: null,
        action: "store_order.cron_auto_complete",
        ip: rm.ip,
        user_agent: rm.userAgent,
      },
    });

    if (!applied.ok) {
      if (applied.error !== "invalid_transition" && applied.error !== "transition_conflict") {
        console.error("[cron store-orders-auto-complete apply]", id, applied.error);
      }
      continue;
    }
    if (applied.idempotent) continue;
    if (applied.previous === applied.order_status) continue;
    completedIds.push(id);
  }

  const idSample = completedIds.slice(0, 80);
  void appendAuditLog(sb, {
    actor_type: "system",
    actor_id: null,
    target_type: "cron_job",
    target_id: "store-orders-auto-complete",
    action: "store_order.cron_auto_complete",
    after_json: {
      completed_count: completedIds.length,
      order_ids: idSample,
      truncated: completedIds.length > idSample.length,
    },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, completed: completedIds.length, order_ids: completedIds });
}

export async function GET(req: Request) {
  return runStoreOrdersAutoComplete(req);
}

export async function POST(req: Request) {
  return runStoreOrdersAutoComplete(req);
}
