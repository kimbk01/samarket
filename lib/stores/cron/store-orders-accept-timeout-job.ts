import type { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import {
  STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
  STORE_ORDER_AUTOMATION_FROM_ISO,
  storeOrderAcceptTimeoutCutoffIso,
} from "@/lib/stores/store-order-lifecycle-automation";

type StoresSb = ReturnType<typeof getSupabaseServer>;

export type StoreOrdersAcceptTimeoutJobResult =
  | { ok: true; cancelled: number; order_ids: string[] }
  | { ok: false; error: string };

/**
 * 미접수 자동 취소 — 결제 완료 `pending` 이 접수 제한시간을 넘기면 SYSTEM(accept_timeout) 으로 취소.
 * status write 는 applyStoreOrderStatusTransition 만 (CAS `pending` — 오너 접수와 경합하면 한쪽만 성공),
 * 재고·쿠폰·상품권 복원과 구매자·오너 알림은 같은 경로가 처리한다.
 * 자동화 기준 시각 이전 주문은 대상이 아니다 (store-order-lifecycle-automation).
 *
 * 2026-11-26 고정 바닥 1단계: 라우트 본문을 그대로 옮김(동작 무변경) — 수동 라우트와 1분 tick 이 같은 함수를 쓴다.
 */
export async function runStoreOrdersAcceptTimeoutJob(
  sb: StoresSb,
  rm: { ip: string | null; userAgent: string | null }
): Promise<StoreOrdersAcceptTimeoutJobResult> {
  const { data: due, error } = await sb
    .from("store_orders")
    .select("id")
    .eq("order_status", "pending")
    .eq("payment_status", "paid")
    .gte("created_at", STORE_ORDER_AUTOMATION_FROM_ISO)
    .lte("created_at", storeOrderAcceptTimeoutCutoffIso())
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[cron store-orders-accept-timeout]", error);
    return { ok: false, error: error.message };
  }

  const cancelledIds: string[] = [];

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

  // 실행 요약은 취소한 주문이 있을 때만 남긴다 — 0건 실행(매분)은 감사 로그에 쌓지 않는다.
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
