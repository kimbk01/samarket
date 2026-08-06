/**
 * Admin Trust History Projection (Slice 7).
 * Reader for reputation_logs — does not write trust_score (writer = applyTrustScoreDelta only).
 */

export const ADMIN_TRUST_HISTORY_LIMIT = 50;

/** Fixed sort: newest first by created_at */
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
