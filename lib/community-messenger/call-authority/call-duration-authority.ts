/**
 * Call duration Authority — SSOT (CUT6).
 *
 * CONTRACT:
 *   if connected_at present:
 *     durationSeconds = max(0, floor((endedAt - connectedAt) / 1000))
 *   else when connectedAtAuthority (terminal write after CUT6):
 *     durationSeconds = 0  (accepted but never connected / missed / cancel / reject)
 *   else legacy / display:
 *     answered_at proxy OR persisted clientDurationSeconds
 *
 * DO NOT:
 * - use ringing started_at as connectedAt
 * - repurpose answered_at as connected_at
 * - invent duration for never-connected new sessions
 * - let caller/callee local timers be independent truth when connected_at exists
 */

export type CallDurationInputs = {
  /** Client-supplied hint (optional). Used only when timestamps unavailable / display of stored logs. */
  clientDurationSeconds?: number | null;
  /** Session answered_at ISO — acceptance only (not media connected). */
  answeredAt?: string | null;
  /** Session connected_at ISO — media establishment (CUT6). */
  connectedAt?: string | null;
  /** Session ended_at ISO */
  endedAt?: string | null;
  /**
   * Terminal writer path after CUT6: when connected_at is absent, duration is 0
   * even if answered_at is set (never-connected after accept).
   */
  connectedAtAuthority?: boolean;
};

function toMs(iso: string | null | undefined): number | null {
  const raw = typeof iso === "string" ? iso.trim() : "";
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolve authoritative call duration for call_logs write and history UI.
 */
export function resolveAuthoritativeCallDurationSeconds(input: CallDurationInputs): number {
  const connectedMs = toMs(input.connectedAt);
  const endedMs = toMs(input.endedAt);
  if (connectedMs != null && endedMs != null && endedMs >= connectedMs) {
    return Math.max(0, Math.floor((endedMs - connectedMs) / 1000));
  }

  if (input.connectedAtAuthority === true) {
    return 0;
  }

  // Legacy pre-CUT6 / rows without connected_at column in payload: answered_at proxy.
  const answeredMs = toMs(input.answeredAt);
  if (answeredMs != null && endedMs != null && endedMs >= answeredMs) {
    return Math.max(0, Math.floor((endedMs - answeredMs) / 1000));
  }

  const client = Math.max(0, Math.floor(Number(input.clientDurationSeconds ?? 0) || 0));
  return client;
}
