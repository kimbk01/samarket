import type { SupabaseClient } from "@supabase/supabase-js";
import type { getSupabaseServer } from "@/lib/chat/supabase-server";
import { STORE_ORDER_AUTOMATION_FROM_ISO } from "@/lib/stores/store-order-lifecycle-automation";
import { createStoreOrderEvent } from "@/lib/stores/store-order-events";
import { notifyStoreOwnerAcceptReminder } from "@/lib/notifications/notify-store-commerce";

type StoresSb = ReturnType<typeof getSupabaseServer>;

type PendingOrderRow = {
  id: string;
  store_id: string;
  order_no: string | null;
  payment_amount: number | null;
  created_at: string | null;
  store_order_items?: Array<{ qty?: number | null }> | null;
};

export type StoreOrderAcceptRemindersJobResult =
  | { ok: true; scanned: number; reminded_30s: number; reminded_60s: number }
  | { ok: false; error: string };

function elapsedSec(createdAt: string | null | undefined, now: number): number {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 1000));
}

function lineCountFromRow(row: PendingOrderRow): number {
  const list = Array.isArray(row.store_order_items) ? row.store_order_items : [];
  const total = list.reduce((sum, item) => sum + Math.max(0, Number(item.qty ?? 0) || 0), 0);
  return Math.max(1, total || list.length || 1);
}

/**
 * 사장님 접수 독촉 — 결제 완료 `pending` 주문이 30초·60초를 넘기면 독촉 푸시 1회씩(dedupe 이벤트).
 * 2026-11-26 고정 바닥 1단계: 라우트 본문을 그대로 옮김(동작 무변경) — 수동 라우트와 1분 tick 이 같은 함수를 쓴다.
 */
export async function runStoreOrderAcceptRemindersJob(sb: StoresSb): Promise<StoreOrderAcceptRemindersJobResult> {
  const nowIso = new Date().toISOString();
  const { data, error } = await sb
    .from("store_orders")
    .select("id, store_id, order_no, payment_amount, created_at, store_order_items(qty)")
    .eq("order_status", "pending")
    .eq("payment_status", "paid")
    .gte("created_at", STORE_ORDER_AUTOMATION_FROM_ISO)
    .lte("created_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as PendingOrderRow[];
  const now = Date.now();
  let reminded30 = 0;
  let reminded60 = 0;

  for (const row of rows) {
    const elapsed = elapsedSec(row.created_at, now);
    const buckets: Array<30 | 60> = [];
    if (elapsed >= 30) buckets.push(30);
    if (elapsed >= 60) buckets.push(60);
    if (buckets.length === 0) continue;

    const orderId = String(row.id ?? "").trim();
    const storeId = String(row.store_id ?? "").trim();
    if (!orderId || !storeId) continue;

    for (const bucket of buckets) {
      const ev = await createStoreOrderEvent(sb as SupabaseClient<any>, {
        orderId,
        storeId,
        actorRole: "system",
        actorUserId: null,
        eventType: "system_note",
        fromStatus: "pending",
        toStatus: "pending",
        dedupeKey: `${orderId}:owner_accept_reminder:${bucket}s`,
        metadata: {
          source: "cron_store_order_accept_reminder",
          reminder_bucket_sec: bucket,
        },
      });
      if (!ev.ok || !ev.inserted) continue;

      await notifyStoreOwnerAcceptReminder(sb as SupabaseClient<any>, {
        storeId,
        orderId,
        orderNo: String(row.order_no ?? ""),
        paymentAmount: Math.round(Number(row.payment_amount ?? 0) || 0),
        lineCount: lineCountFromRow(row),
        reminderBucketSec: bucket,
        storeOrderEventId: ev.row.id,
      });
      if (bucket === 30) reminded30 += 1;
      if (bucket === 60) reminded60 += 1;
    }
  }

  return { ok: true, scanned: rows.length, reminded_30s: reminded30, reminded_60s: reminded60 };
}
