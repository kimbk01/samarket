/**
 * Coin 출금 처리 결과 → 사장님 알림 (재감사 R1 · Owner 「설계안대로 수정」 2026-11-03).
 * Cash 충전 결과(`delivery-ad-business-cash-charge-notify.ts`)와 같은 방식 — 매장 id 를 실어 매장 알림함 소속, 회원 종 제외.
 * 돈 경로는 반려·지급 RPC 가 끝낸 뒤 — 알림 실패가 처리 결과를 바꾸지 않는다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { formatFinanceAmount } from "@/lib/finance/presentation";
import { ownerFinanceSectionHref } from "@/lib/finance/routes";
import { COIN_WITHDRAWAL_REQUESTS_TABLE } from "@/lib/currency/coin-withdrawal-writer";

export type CoinWithdrawalOutcome = "rejected" | "paid";

async function loadWithdrawalNotifyFields(
  sb: SupabaseClient,
  requestId: string
): Promise<{ storeId: string; ownerUserId: string; amount: number } | null> {
  const { data } = await sb
    .from(COIN_WITHDRAWAL_REQUESTS_TABLE)
    .select("store_id, amount")
    .eq("id", requestId)
    .maybeSingle();
  const storeId = String((data as { store_id?: unknown } | null)?.store_id ?? "").trim();
  if (!storeId) return null;
  const amount = Math.trunc(Number((data as { amount?: unknown }).amount) || 0);
  const { data: store } = await sb.from("stores").select("owner_user_id").eq("id", storeId).maybeSingle();
  const ownerUserId = String((store as { owner_user_id?: unknown } | null)?.owner_user_id ?? "").trim();
  return ownerUserId ? { storeId, ownerUserId, amount } : null;
}

export async function safeNotifyOwnerCoinWithdrawalOutcome(
  sb: SupabaseClient,
  input: { requestId: string; outcome: CoinWithdrawalOutcome; reason?: string | null }
): Promise<void> {
  try {
    const requestId = String(input.requestId ?? "").trim();
    if (!requestId) return;
    const f = await loadWithdrawalNotifyFields(sb, requestId);
    if (!f) return;
    const language = await loadNotificationUserLanguage(sb, f.ownerUserId);
    const amount = formatFinanceAmount({ wallet: "COIN", amount: f.amount });
    const rejected = input.outcome === "rejected";
    await appendUserNotification(sb, {
      user_id: f.ownerUserId,
      notification_type: "system",
      // 사장님 업무 알림 — 마케팅 아님 (Cash 충전 결과와 같음)
      push_kind: "notice",
      title: notifySafeT(
        language,
        rejected ? "notify_store_coin_withdrawal_rejected_title" : "notify_store_coin_withdrawal_paid_title"
      ),
      body: notifySafeT(
        language,
        rejected ? "notify_store_coin_withdrawal_rejected_body" : "notify_store_coin_withdrawal_paid_body",
        { vars: { amount, reason: String(input.reason ?? "").trim() || "—" } }
      ),
      link_url: ownerFinanceSectionHref(f.storeId, "withdraw"),
      // 같은 결정 재처리 → 같은 키(중복 알림 없음)
      dedupe_key: `store_coin_withdrawal_${input.outcome}:${requestId}`,
      ref_id: requestId,
      meta: {
        kind: rejected ? "store_coin_withdrawal_rejected" : "store_coin_withdrawal_paid",
        store_id: f.storeId,
        request_id: requestId,
        amount: f.amount,
      },
    });
  } catch (err) {
    console.error("[safeNotifyOwnerCoinWithdrawalOutcome]", input.requestId, err);
  }
}
