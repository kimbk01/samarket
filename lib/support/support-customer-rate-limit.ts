import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 고객 문의 최종 감사 D5 (2026-11-28) — 고객(회원·사장님) 글 속도 제한.
 * 고객 글 1건 = 어드민 알림·푸시(담당자 또는 support 어드민 전원)라, 반복 전송이 그대로 어드민 푸시 폭주가 된다.
 * 기준 = 그 사람이 보낸 고객 글(`support_messages.sender_user_id`, 접수 첫 글 포함) — 1분 5건 · 1시간 30건.
 * 한도에 이미 닿았으면 새 글(추가 문의·새 접수)을 받지 않는다 → API 429 `rate_limited`.
 * 읽기 실패는 막지 않는다(고객 접수가 조회 오류로 끊기지 않게 — 기록만).
 */
export const SUPPORT_CUSTOMER_POSTS_PER_MINUTE = 5;
export const SUPPORT_CUSTOMER_POSTS_PER_HOUR = 30;

export async function checkSupportCustomerPostRate(
  sb: SupabaseClient,
  userId: string,
  now: Date = new Date()
): Promise<"ok" | "rate_limited"> {
  const uid = userId.trim();
  if (!uid) return "ok";
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const minuteAgoMs = now.getTime() - 60_000;
  // 쿼리 1번: 지난 1시간 고객 글 시각(최대 한도+1건) → 1분·1시간 둘 다 센다
  const { data, error } = await sb
    .from("support_messages")
    .select("created_at")
    .eq("sender_user_id", uid)
    .in("sender_type", ["MEMBER", "OWNER"])
    .gte("created_at", hourAgo)
    .order("created_at", { ascending: false })
    .limit(SUPPORT_CUSTOMER_POSTS_PER_HOUR + 1);
  if (error) {
    console.warn("[support] rate_limit_read_failed", { error: error.message });
    return "ok";
  }
  const rows = (data ?? []) as { created_at?: unknown }[];
  if (rows.length >= SUPPORT_CUSTOMER_POSTS_PER_HOUR) return "rate_limited";
  const lastMinute = rows.filter((r) => {
    const ms = Date.parse(String(r.created_at ?? ""));
    return Number.isFinite(ms) && ms >= minuteAgoMs;
  }).length;
  return lastMinute >= SUPPORT_CUSTOMER_POSTS_PER_MINUTE ? "rate_limited" : "ok";
}
