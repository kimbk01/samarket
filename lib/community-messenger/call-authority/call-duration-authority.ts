/**
 * Call duration Authority — SSOT.
 *
 * CONTRACT:
 *   durationSeconds = max(0, floor((endedAt - connectedAt) / 1000))
 * where connectedAt is session `answered_at` (signaling accept / media-eligible start).
 *
 * DO NOT:
 * - use ringing `started_at` as connectedAt
 * - trust client timer as sole write when answered_at + ended_at exist
 * - invent duration for cancel / reject / missed / busy (no answered_at)
 */

export type CallDurationInputs = {
  /** Client-supplied hint (optional). Used only when timestamps unavailable. */
  clientDurationSeconds?: number | null;
  /** Session answered_at ISO — Authority connectedAt proxy */
  answeredAt?: string | null;
  /** Session ended_at ISO */
  endedAt?: string | null;
};

function toMs(iso: string | null | undefined): number | null {
  const raw = typeof iso === "string" ? iso.trim() : "";
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve authoritative call duration for call_logs write and history UI.
 * Returns 0 when never connected (no answered_at) or timestamps invalid.
 */
export function resolveAuthoritativeCallDurationSeconds(input: CallDurationInputs): number {
  const answeredMs = toMs(input.answeredAt);
  const endedMs = toMs(input.endedAt);
  if (answeredMs != null && endedMs != null && endedMs >= answeredMs) {
    return Math.max(0, Math.floor((endedMs - answeredMs) / 1000));
  }
  const client = Math.max(0, Math.floor(Number(input.clientDurationSeconds ?? 0) || 0));
  // Client duration is only a fallback when we lack answered_at (legacy rows).
  // Never inflate from ringing start — that path is intentionally removed.
  return client;
}
