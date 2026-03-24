import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 조회 시점에 1차 시간 기반 채팅 모드 전환 (배치 없이 GET에서 idempotent 갱신).
 * - 거래완료 확인/후기대기 단계에서 기한+유예 경과 시: open → limited (당근형 제한 모드)
 * - 후기 완료(limited) 후 일정 기간: limited → readonly
 * - seller_marked_done 구간은 거래완료 확인 UI 유지를 위해 여기서 limited로 강등하지 않음
 */
const REVIEW_COMPLETED_READONLY_AFTER_MS = 21 * 24 * 60 * 60 * 1000;
const POST_CONFIRM_GRACE_AFTER_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

export async function applyProductChatTimeTransitions(
  sb: SupabaseClient<any>,
  productChatId: string
): Promise<void> {
  const sbAny = sb as SupabaseClient;
  const { data: row } = await sbAny
    .from("product_chats")
    .select("id, trade_flow_status, chat_mode, review_deadline_at, updated_at")
    .eq("id", productChatId)
    .maybeSingle();

  if (!row) return;

  const now = Date.now();
  const flow = String((row as { trade_flow_status?: string }).trade_flow_status ?? "chatting");
  const mode = String((row as { chat_mode?: string }).chat_mode ?? "open");
  const deadlineRaw = (row as { review_deadline_at?: string | null }).review_deadline_at;
  const deadlineMs = deadlineRaw ? Date.parse(deadlineRaw) : NaN;
  const updatedMs = Date.parse(String((row as { updated_at?: string }).updated_at ?? "")) || 0;

  if (
    (flow === "buyer_confirmed" || flow === "review_pending") &&
    mode === "open" &&
    !Number.isNaN(deadlineMs) &&
    now > deadlineMs + POST_CONFIRM_GRACE_AFTER_DEADLINE_MS
  ) {
    await sbAny
      .from("product_chats")
      .update({ chat_mode: "limited", updated_at: new Date().toISOString() })
      .eq("id", productChatId)
      .in("trade_flow_status", ["buyer_confirmed", "review_pending"])
      .eq("chat_mode", "open");
  }

  if (
    flow === "review_completed" &&
    mode === "limited" &&
    updatedMs > 0 &&
    now - updatedMs > REVIEW_COMPLETED_READONLY_AFTER_MS
  ) {
    await sbAny
      .from("product_chats")
      .update({ chat_mode: "readonly", updated_at: new Date().toISOString() })
      .eq("id", productChatId)
      .eq("trade_flow_status", "review_completed")
      .eq("chat_mode", "limited");
  }
}
