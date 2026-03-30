import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOpsTradePolicy, reviewDeadlineIsoFromNow } from "@/lib/trade/ops-trade-policy";

const AUTO_CONFIRM_SWEEP_COOLDOWN_MS = 30_000;
let lastSweepStartedAt = 0;
let sweepPromise: Promise<number> | null = null;

/**
 * 판매자 거래완료 후 N일 경과 시 구매자 거래완료 확인을 자동 처리 (idempotent)
 */
export async function applyBuyerAutoConfirmForRoom(sb: SupabaseClient<any>, productChatId: string): Promise<void> {
   
  const sbAny = sb as any;
  const policy = await fetchOpsTradePolicy(sb);
  const { data: row } = await sbAny
    .from("product_chats")
    .select("id, trade_flow_status, seller_completed_at")
    .eq("id", productChatId)
    .maybeSingle();

  if (!row) return;
  const flow = String((row as { trade_flow_status?: string }).trade_flow_status ?? "chatting");
  if (flow !== "seller_marked_done") return;
  const completedAt = (row as { seller_completed_at?: string | null }).seller_completed_at;
  if (!completedAt) return;

  const threshold = Date.now() - policy.buyerAutoConfirmDays * 86400000;
  if (Date.parse(completedAt) > threshold) return;

  const now = new Date().toISOString();
  const reviewDeadlineAt = reviewDeadlineIsoFromNow(policy.buyerReviewDeadlineDays);

  await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "buyer_confirmed",
      buyer_confirmed_at: now,
      buyer_confirm_source: "system",
      review_deadline_at: reviewDeadlineAt,
      chat_mode: "open",
      updated_at: now,
    })
    .eq("id", productChatId)
    .eq("trade_flow_status", "seller_marked_done");
}

/**
 * 목록/배치 API 진입 시 한 번 호출 — 모든 미처리 건 일괄 자동 확인
 */
export async function applyBuyerAutoConfirmAllDue(sb: SupabaseClient<any>): Promise<number> {
  const nowTs = Date.now();
  if (sweepPromise) return sweepPromise;
  if (nowTs - lastSweepStartedAt < AUTO_CONFIRM_SWEEP_COOLDOWN_MS) {
    return 0;
  }

  lastSweepStartedAt = nowTs;
  sweepPromise = runBuyerAutoConfirmSweep(sb)
    .catch(() => 0)
    .finally(() => {
      sweepPromise = null;
    });
  return sweepPromise;
}

async function runBuyerAutoConfirmSweep(sb: SupabaseClient<any>): Promise<number> {
  const sbAny = sb as any;
  const policy = await fetchOpsTradePolicy(sb);
  const cutoff = new Date(Date.now() - policy.buyerAutoConfirmDays * 86400000).toISOString();
  const now = new Date().toISOString();
  const reviewDeadlineAt = reviewDeadlineIsoFromNow(policy.buyerReviewDeadlineDays);

  const { data: due, error } = await sbAny
    .from("product_chats")
    .select("id")
    .eq("trade_flow_status", "seller_marked_done")
    .not("seller_completed_at", "is", null)
    .lt("seller_completed_at", cutoff);

  if (error || !due?.length) return 0;

  const { error: updErr } = await sbAny
    .from("product_chats")
    .update({
      trade_flow_status: "buyer_confirmed",
      buyer_confirmed_at: now,
      buyer_confirm_source: "system",
      review_deadline_at: reviewDeadlineAt,
      chat_mode: "open",
      updated_at: now,
    })
    .eq("trade_flow_status", "seller_marked_done")
    .not("seller_completed_at", "is", null)
    .lt("seller_completed_at", cutoff);

  if (updErr) return 0;
  return due.length;
}
