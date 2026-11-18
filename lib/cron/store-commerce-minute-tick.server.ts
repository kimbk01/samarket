/**
 * Phase C1 — 1분 cron 3종(접수 리마인더·접수 타임아웃·채팅 푸시 인계)을 한 틱으로.
 * 유휴 시 store 쪽은 pending 유무 probe 1회 후 스킵 → 분당 SB 3→~2.
 * 채팅 푸시 인계는 통화 규정상 side-effect 게이트 밖(기존과 동일).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_ORDER_AUTOMATION_FROM_ISO } from "@/lib/stores/store-order-lifecycle-automation";
import { createStoreOrderEvent } from "@/lib/stores/store-order-events";
import { notifyStoreOwnerAcceptReminder } from "@/lib/notifications/notify-store-commerce";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import {
  STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
  storeOrderAcceptTimeoutCutoffIso,
} from "@/lib/stores/store-order-lifecycle-automation";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import {
  claimChatPushHandoffEvents,
  processClaimedChatPushHandoff,
} from "@/lib/notifications/chat-notification-push-handoff";
import type { NotificationEventRow } from "@/lib/notifications/core/notification-event-schema";

type PendingOrderRow = {
  id: string;
  store_id: string;
  order_no: string | null;
  payment_amount: number | null;
  created_at: string | null;
  store_order_items?: Array<{ qty?: number | null }> | null;
};

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

/** 리마인더(≥30s) 또는 타임아웃 대상이 1건이라도 있으면 true — 없으면 store 두 작업 스킵 */
export async function probeStoreAcceptAutomationDue(
  sb: SupabaseClient
): Promise<boolean> {
  const cutoff30 = new Date(Date.now() - 30_000).toISOString();
  const { data, error } = await sb
    .from("store_orders")
    .select("id")
    .eq("order_status", "pending")
    .eq("payment_status", "paid")
    .gte("created_at", STORE_ORDER_AUTOMATION_FROM_ISO)
    .lte("created_at", cutoff30)
    .limit(1);
  if (error) {
    console.error("[probeStoreAcceptAutomationDue]", error.message);
    return true; // fail-open → 기존처럼 store 작업 실행
  }
  return (data?.length ?? 0) > 0;
}

export async function executeStoreOrderAcceptReminders(
  sb: SupabaseClient
): Promise<{ ok: true; scanned: number; reminded_30s: number; reminded_60s: number } | { ok: false; error: string }> {
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
  if (error) return { ok: false, error: error.message };

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
      const ev = await createStoreOrderEvent(sb as SupabaseClient, {
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

      await notifyStoreOwnerAcceptReminder(sb as SupabaseClient, {
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

export async function executeStoreOrdersAcceptTimeout(
  sb: SupabaseClient,
  req: Request
): Promise<{ ok: true; cancelled: number; order_ids: string[] } | { ok: false; error: string }> {
  const { data: due, error } = await sb
    .from("store_orders")
    .select("id")
    .eq("order_status", "pending")
    .eq("payment_status", "paid")
    .gte("created_at", STORE_ORDER_AUTOMATION_FROM_ISO)
    .lte("created_at", storeOrderAcceptTimeoutCutoffIso())
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return { ok: false, error: error.message };

  const cancelledIds: string[] = [];
  const rm = getAuditRequestMeta(req);

  for (const row of due ?? []) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;

    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: id,
      nextStatus: "cancelled",
      actor: "SYSTEM",
      systemPurpose: "accept_timeout",
      expectedCurrentStatus: "pending",
      eventMessage: null,
      eventMetadata: {
        source: "cron_store_order_accept_timeout",
        accept_timeout_minutes: STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
      },
      audit: {
        actor_type: "system",
        actor_id: null,
        action: "store_order.cron_accept_timeout_cancel",
        ip: rm.ip,
        user_agent: rm.userAgent,
      },
    });

    if (!applied.ok) {
      if (applied.error !== "invalid_transition" && applied.error !== "transition_conflict") {
        console.error("[cron store-orders-accept-timeout apply]", id, applied.error);
      }
      continue;
    }
    if (applied.idempotent) continue;
    if (applied.previous === applied.order_status) continue;
    cancelledIds.push(id);
  }

  if (cancelledIds.length > 0) {
    const idSample = cancelledIds.slice(0, 80);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "cron_job",
      target_id: "store-orders-accept-timeout",
      action: "store_order.cron_accept_timeout_cancel",
      after_json: {
        cancelled_count: cancelledIds.length,
        accept_timeout_minutes: STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
        order_ids: idSample,
        truncated: cancelledIds.length > idSample.length,
      },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
  }

  return { ok: true, cancelled: cancelledIds.length, order_ids: cancelledIds };
}

export async function executeNotificationPushHandoff(sb: SupabaseClient): Promise<{
  ok: true;
  claimed: number;
  results: Array<{ id: string; result: string }>;
}> {
  const claimToken = `cph2_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const claimed = await claimChatPushHandoffEvents(sb, { limit: 40, claimToken });
  const results: Array<{ id: string; result: string }> = [];
  for (const row of claimed) {
    const withToken = { ...row, _claimToken: claimToken } as NotificationEventRow & {
      _claimToken?: string;
    };
    const result = await processClaimedChatPushHandoff(sb, withToken);
    results.push({ id: row.id, result });
  }
  return { ok: true, claimed: claimed.length, results };
}
