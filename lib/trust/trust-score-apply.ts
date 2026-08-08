/**
 * @deprecated Legacy mutable trust writer — DO NOT use for Manner Battery SSOT.
 * Use recordTrustEvent + recomputeMemberTrustSnapshot from trust-event-ledger.ts.
 * Kept as a hard no-op throw surface so accidental imports fail loudly in tests/runtime.
 */

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

export interface ApplyTrustScoreParams {
  userId: string;
  sourceType: TrustReputationSourceType;
  sourceId?: string | null;
  baseDelta: number;
  recentPositiveBoost?: boolean;
  skipDailyCap?: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** @deprecated Removed — Manner Battery SSOT forbids mutable delta writes. */
export async function applyTrustScoreDelta(
  _sb: unknown,
  _p: ApplyTrustScoreParams
): Promise<void> {
  throw new Error(
    "applyTrustScoreDelta is removed. Use recordTrustEvent (lib/trust/trust-event-ledger.ts)."
  );
}

/** @deprecated Removed — Manner Battery SSOT forbids mutable delta writes. */
export async function applyTrustScoreDeltaToMany(
  _sb: unknown,
  _userIds: string[],
  _params: Omit<ApplyTrustScoreParams, "userId">
): Promise<void> {
  throw new Error(
    "applyTrustScoreDeltaToMany is removed. Use recordTrustEvent (lib/trust/trust-event-ledger.ts)."
  );
}
