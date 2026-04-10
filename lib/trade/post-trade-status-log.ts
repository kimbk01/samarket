import type { SupabaseClient } from "@supabase/supabase-js";
import type { TradeLifecycleStatus } from "@/lib/trade/trade-lifecycle-policy";

/**
 * 거래 상태 변경 로그 — 테이블이 없으면 조용히 무시(로컬·구 DB 호환).
 */
export async function insertPostTradeStatusLog(
  sb: SupabaseClient,
  input: {
    postId: string;
    fromStatus: TradeLifecycleStatus | null;
    toStatus: TradeLifecycleStatus;
    userId: string;
    snapshot?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    const { error } = await sb.from("post_trade_status_logs").insert({
      post_id: input.postId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      user_id: input.userId,
      snapshot: input.snapshot ?? null,
    });
    if (error && /relation|does not exist|schema cache/i.test(String(error.message))) {
      return;
    }
  } catch {
    /* ignore */
  }
}
