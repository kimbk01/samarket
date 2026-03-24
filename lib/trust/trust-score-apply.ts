/**
 * Supabase 서버에서 trust_score 반영 + reputation_logs 기록
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clampTrustScore,
  capPositiveDeltaByDailyLimit,
  computeWeightedDelta,
  TRUST_SCORE_DEFAULT,
} from "./trust-score-core";

export type TrustReputationSourceType =
  | "review"
  | "report"
  | "admin_adjust"
  | "no_show"
  | "dispute_hold"
  | "dispute_release"
  | "trade_complete"
  | "manner_positive"
  | "chat_fast_response"
  | "block"
  | "system_penalty";

type Sb = SupabaseClient<any>;

function utcDayStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

async function sumPositiveDeltasToday(sb: Sb, userId: string): Promise<number> {
  const start = utcDayStartIso();
  const { data, error } = await sb
    .from("reputation_logs")
    .select("delta")
    .eq("user_id", userId)
    .gte("created_at", start)
    .eq("status", "applied");

  if (error || !data?.length) return 0;
  let s = 0;
  for (const row of data as { delta?: number }[]) {
    const d = Number(row.delta ?? 0);
    if (d > 0) s += d;
  }
  return Math.round(s * 100) / 100;
}

export interface ApplyTrustScoreParams {
  userId: string;
  sourceType: TrustReputationSourceType;
  sourceId?: string | null;
  baseDelta: number;
  /** 거래·후기 등 최근 행동이면 가산 1.5배 */
  recentPositiveBoost?: boolean;
  /** 관리자 조정 등 — 일일 가산 상한 미적용 */
  skipDailyCap?: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * trust_score 갱신(컬럼 있을 때) + reputation_logs 1건.
 * 컬럼/정책 오류 시 로그만 시도 후 조용히 실패 가능.
 */
export async function applyTrustScoreDelta(sb: Sb, p: ApplyTrustScoreParams): Promise<void> {
  const userId = p.userId?.trim();
  if (!userId || !Number.isFinite(p.baseDelta)) return;

  let weighted = computeWeightedDelta(p.baseDelta, p.recentPositiveBoost === true);
  if (weighted > 0 && !p.skipDailyCap) {
    const today = await sumPositiveDeltasToday(sb, userId);
    weighted = capPositiveDeltaByDailyLimit(weighted, today);
  }
  if (weighted === 0 && p.baseDelta !== 0) {
    /* 일일 상한으로 가산이 0이 된 경우에도 이력은 남김 */
  }

  let current = TRUST_SCORE_DEFAULT;
  try {
    const { data: prof } = await sb
      .from("profiles")
      .select("trust_score")
      .eq("id", userId)
      .maybeSingle();
    const ts = (prof as { trust_score?: number } | null)?.trust_score;
    if (ts != null && Number.isFinite(Number(ts))) {
      current = clampTrustScore(Number(ts));
    }
  } catch {
    /* ignore */
  }

  const next = clampTrustScore(current + weighted);

  const meta = {
    ...(p.metadata ?? {}),
    base_delta: p.baseDelta,
    weighted_delta: weighted,
    recent_boost: p.recentPositiveBoost === true,
  };

  try {
    await sb.from("reputation_logs").insert({
      user_id: userId,
      source_type: p.sourceType,
      source_id: p.sourceId ?? null,
      delta: weighted,
      status: "applied",
      reason: p.reason ?? p.sourceType,
      metadata: meta,
    } as never);
  } catch {
    /* source_type 미확장 DB 등 */
  }

  if (weighted === 0) return;

  try {
    await sb.from("profiles").update({ trust_score: next } as never).eq("id", userId);
  } catch {
    /* trust_score 컬럼 없음 */
  }
}

export async function applyTrustScoreDeltaToMany(
  sb: Sb,
  userIds: string[],
  params: Omit<ApplyTrustScoreParams, "userId">
): Promise<void> {
  for (const uid of userIds) {
    if (!uid?.trim()) continue;
    await applyTrustScoreDelta(sb, { ...params, userId: uid.trim() });
  }
}
