import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_BUYER_AUTO_CONFIRM_DAYS = 7;
export const DEFAULT_BUYER_REVIEW_DEADLINE_DAYS = 14;

export interface OpsTradePolicy {
  buyerAutoConfirmDays: number;
  buyerReviewDeadlineDays: number;
}

export function clampPolicyDays(n: number, fallback: number): number {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x) || x < 1) return fallback;
  if (x > 365) return 365;
  return x;
}

/**
 * Supabase ops_trade_policy 단일 행. 테이블 없으면 기본값.
 */
export async function fetchOpsTradePolicy(sb: SupabaseClient<any>): Promise<OpsTradePolicy> {
   
  const sbAny = sb as any;
  try {
    const { data } = await sbAny.from("ops_trade_policy").select("buyer_auto_confirm_days, buyer_review_deadline_days").eq("id", 1).maybeSingle();
    const row = data as { buyer_auto_confirm_days?: number; buyer_review_deadline_days?: number } | null;
    if (!row) {
      return {
        buyerAutoConfirmDays: DEFAULT_BUYER_AUTO_CONFIRM_DAYS,
        buyerReviewDeadlineDays: DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
      };
    }
    return {
      buyerAutoConfirmDays: clampPolicyDays(row.buyer_auto_confirm_days ?? DEFAULT_BUYER_AUTO_CONFIRM_DAYS, DEFAULT_BUYER_AUTO_CONFIRM_DAYS),
      buyerReviewDeadlineDays: clampPolicyDays(
        row.buyer_review_deadline_days ?? DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
        DEFAULT_BUYER_REVIEW_DEADLINE_DAYS
      ),
    };
  } catch {
    return {
      buyerAutoConfirmDays: DEFAULT_BUYER_AUTO_CONFIRM_DAYS,
      buyerReviewDeadlineDays: DEFAULT_BUYER_REVIEW_DEADLINE_DAYS,
    };
  }
}

export function reviewDeadlineIsoFromNow(reviewDays: number): string {
  const d = clampPolicyDays(reviewDays, DEFAULT_BUYER_REVIEW_DEADLINE_DAYS);
  return new Date(Date.now() + d * 86400000).toISOString();
}
