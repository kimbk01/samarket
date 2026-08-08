/**
 * Admin Trust History Projection.
 * Primary: trust_events. Legacy: reputation_logs (migration window only).
 * Writer authority: recordTrustEvent only (not applyTrustScoreDelta).
 */

export const ADMIN_TRUST_HISTORY_LIMIT = 50;

/** Fixed sort: newest first */
export const ADMIN_TRUST_HISTORY_ORDER_ASCENDING = false;

export type AdminTrustHistoryEntry = {
  id: string;
  userId: string;
  sourceType: string;
  sourceId: string | null;
  delta: number;
  status: string;
  reason: string | null;
  createdAt: string | null;
};

/**
 * Normalize one reputation_logs row. Returns null if user_id ≠ expected (isolation).
 */
export function normalizeAdminTrustHistoryRow(
  row: Record<string, unknown>,
  expectedUserId: string,
): AdminTrustHistoryEntry | null {
  const userId = String(row.user_id ?? "").trim();
  if (!userId || userId !== expectedUserId) return null;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const delta = Number(row.delta ?? 0);
  return {
    id,
    userId,
    sourceType: String(row.source_type ?? "").trim() || "unknown",
    sourceId: row.source_id != null ? String(row.source_id) : null,
    delta: Number.isFinite(delta) ? Math.round(delta * 100) / 100 : 0,
    status: String(row.status ?? "").trim() || "unknown",
    reason: row.reason != null ? String(row.reason) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  };
}

export function filterAdminTrustHistoryRows(
  rows: Record<string, unknown>[] | null | undefined,
  expectedUserId: string,
): AdminTrustHistoryEntry[] {
  if (!rows?.length) return [];
  const out: AdminTrustHistoryEntry[] = [];
  for (const row of rows) {
    const n = normalizeAdminTrustHistoryRow(row, expectedUserId);
    if (n) out.push(n);
  }
  return out;
}

/** Normalize trust_events row into the same Admin history projection shape. */
export function normalizeAdminTrustEventRow(
  row: Record<string, unknown>,
  expectedUserId: string,
): AdminTrustHistoryEntry | null {
  const userId = String(row.member_id ?? "").trim();
  if (!userId || userId !== expectedUserId) return null;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const adj = Number(meta.adjustment ?? 0);
  const delta = Number.isFinite(adj) ? Math.round(adj * 100) / 100 : 0;
  return {
    id,
    userId,
    sourceType: String(row.event_type ?? row.source_type ?? "unknown"),
    sourceId: row.source_id != null ? String(row.source_id) : null,
    delta,
    status: String(row.status ?? "").trim() || "unknown",
    reason:
      meta.reason != null
        ? String(meta.reason)
        : row.direction != null
          ? String(row.direction)
          : null,
    createdAt: row.occurred_at != null ? String(row.occurred_at) : null,
  };
}

export function filterAdminTrustEventRows(
  rows: Record<string, unknown>[] | null | undefined,
  expectedUserId: string,
): AdminTrustHistoryEntry[] {
  if (!rows?.length) return [];
  const out: AdminTrustHistoryEntry[] = [];
  for (const row of rows) {
    const n = normalizeAdminTrustEventRow(row, expectedUserId);
    if (n) out.push(n);
  }
  return out;
}
