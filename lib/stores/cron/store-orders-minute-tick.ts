import type { getSupabaseServer } from "@/lib/chat/supabase-server";
import { STORE_ORDER_AUTOMATION_FROM_ISO } from "@/lib/stores/store-order-lifecycle-automation";
import {
  runStoreOrdersAcceptTimeoutJob,
  type StoreOrdersAcceptTimeoutJobResult,
} from "@/lib/stores/cron/store-orders-accept-timeout-job";
import {
  runStoreOrderAcceptRemindersJob,
  type StoreOrderAcceptRemindersJobResult,
} from "@/lib/stores/cron/store-order-accept-reminders-job";

type StoresSb = ReturnType<typeof getSupabaseServer>;

export type StoreOrdersMinuteTickResult = {
  ok: boolean;
  /** 결제 완료 `pending` 주문 유무 — null = 확인 실패(두 작업을 그대로 실행) */
  pending: boolean | null;
  skipped: boolean;
  accept_timeout: StoreOrdersAcceptTimeoutJobResult | null;
  accept_reminders: StoreOrderAcceptRemindersJobResult | null;
};

/**
 * 두 작업이 보는 행은 모두 `order_status=pending · payment_status=paid · created_at ∈ [자동화 기준, 지금]` 의 부분집합이다
 * (자동 취소는 그중 접수 제한시간 지난 것). 이 조건으로 1행만 확인해 없으면 두 작업 모두 할 일이 없다.
 */
export async function hasPendingPaidStoreOrders(sb: StoresSb): Promise<boolean | null> {
  const { data, error } = await sb
    .from("store_orders")
    .select("id")
    .eq("order_status", "pending")
    .eq("payment_status", "paid")
    .gte("created_at", STORE_ORDER_AUTOMATION_FROM_ISO)
    .lte("created_at", new Date().toISOString())
    .limit(1);
  if (error) {
    console.error("[cron store-orders-minute-tick probe]", error.message);
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * 고정 바닥 1단계(Owner 「1단계 구현 승인」 2026-11-26) — 1분 cron 2개(미접수 자동 취소·접수 독촉)를 하나로.
 * 할 일 없음 = Supabase 1번(확인 읽기). 할 일 있음 = 확인 1 + 지금 두 작업 그대로(자동 취소 → 독촉).
 * 확인 실패 시 지금처럼 두 작업을 실행한다(놓치지 않음). 한 작업의 예외가 다른 작업을 막지 않는다.
 */
export async function runStoreOrdersMinuteTick(
  sb: StoresSb,
  rm: { ip: string | null; userAgent: string | null }
): Promise<StoreOrdersMinuteTickResult> {
  const pending = await hasPendingPaidStoreOrders(sb);
  if (pending === false) {
    return { ok: true, pending, skipped: true, accept_timeout: null, accept_reminders: null };
  }

  let acceptTimeout: StoreOrdersAcceptTimeoutJobResult;
  try {
    acceptTimeout = await runStoreOrdersAcceptTimeoutJob(sb, rm);
  } catch (e) {
    console.error("[cron store-orders-minute-tick accept-timeout]", e);
    acceptTimeout = { ok: false, error: errorMessage(e) };
  }

  let acceptReminders: StoreOrderAcceptRemindersJobResult;
  try {
    acceptReminders = await runStoreOrderAcceptRemindersJob(sb);
  } catch (e) {
    console.error("[cron store-orders-minute-tick accept-reminders]", e);
    acceptReminders = { ok: false, error: errorMessage(e) };
  }

  return {
    ok: acceptTimeout.ok && acceptReminders.ok,
    pending,
    skipped: false,
    accept_timeout: acceptTimeout,
    accept_reminders: acceptReminders,
  };
}
