/**
 * P0-3 — 포인트 결제 후 적용이 실패했을 때 환급.
 * - 환급 키(relatedType+relatedId)는 호출처가 결정적으로 정한다 → 재시도해도 credit_user_points 가 1회만 지급.
 * - 바로 몇 번 다시 시도하고, 그래도 실패하면 「환급 대기」 감사 행(point_action_logs)을 남기고 refund_pending 을 돌려준다.
 *   원장에는 차감 행만 있고 같은 키의 ad_refund 행이 없으므로, 같은 키로 다시 호출하면 그대로 복구된다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointLedgerRelatedType } from "@/lib/types/point";
import { creditUserPoints } from "@/lib/points/user-point-ledger";
import { insertPointActionLogDb } from "@/lib/points/point-execution-db";

export const POINT_REFUND_PENDING_ACTION = "point_refund_pending";
const REFUND_ATTEMPTS = 3;

export type RefundAfterFailedPurchaseResult =
  | { ok: true; duplicate: boolean; balanceAfter: number }
  | { ok: false; refundPending: true; error: string; refundKey: string };

export async function refundPointsAfterFailedPurchase(
  sb: SupabaseClient,
  input: {
    userId: string;
    amount: number;
    relatedType: PointLedgerRelatedType;
    refundRelatedId: string;
    description: string;
  }
): Promise<RefundAfterFailedPurchaseResult> {
  const refundKey = `${input.relatedType}:${input.refundRelatedId}`;
  let lastError = "refund_failed";
  for (let attempt = 0; attempt < REFUND_ATTEMPTS; attempt += 1) {
    const credited = await creditUserPoints(sb, {
      userId: input.userId,
      amount: input.amount,
      entryType: "ad_refund",
      relatedType: input.relatedType,
      relatedId: input.refundRelatedId,
      description: input.description,
      actorType: "system",
    });
    if (credited.ok) {
      return { ok: true, duplicate: credited.duplicate === true, balanceAfter: credited.balanceAfter };
    }
    lastError = credited.error;
    if (credited.error === "invalid_input" || credited.error === "user_not_found") break;
  }
  console.error("[refundPointsAfterFailedPurchase] refund pending", refundKey, lastError);
  try {
    await insertPointActionLogDb(sb, {
      actionType: POINT_REFUND_PENDING_ACTION,
      actorType: "system",
      actorId: "system",
      actorNickname: "시스템",
      targetUserId: input.userId,
      targetUserNickname: "",
      relatedId: refundKey,
      note: `포인트 환급 대기 ${input.amount}P · ${input.description} · 원인 ${lastError} · 같은 키로 재시도 시 1회만 환급`,
    });
  } catch (e) {
    console.error("[refundPointsAfterFailedPurchase] audit write failed", refundKey, e);
  }
  return { ok: false, refundPending: true, error: lastError, refundKey };
}
