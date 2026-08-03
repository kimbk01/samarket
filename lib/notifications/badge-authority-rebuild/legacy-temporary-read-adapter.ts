/**
 * Gate 3 Step 10 — Temporary read-only adapter for non-backfilled legacy rows.
 *
 * ALLOW: map legacy → canonical inbox shape when no matching canonical dedupe.
 * FORBID: add adapter count to A digit · write to legacy · permanent authority.
 */

import {
  classifyLegacyNotificationsRowForBackfill,
  legacyNotificationsDedupeKey,
  type LegacyNotificationsBackfillRow,
} from "@/lib/notifications/badge-authority-rebuild/legacy-cutover-backfill";

export const LEGACY_TEMPORARY_READ_ADAPTER = "legacy_temporary_read_adapter_v1" as const;

/** Documented removal gate — adapter must not become permanent authority. */
export const LEGACY_ADAPTER_REMOVAL = {
  adapterRemovalCondition:
    "remainingLegacyCount===0 OR all A-eligible rows backfilled (dedupe keys present)",
  /** Soft expiry target after cutover CODE PASS (ops window). Not a runtime kill switch. */
  adapterExpiry: "2026-09-01T00:00:00.000Z",
  role: "read_only_compatibility" as const,
} as const;

export type LegacyAdapterInboxShape = Readonly<{
  id: string;
  source: "legacy_adapter";
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
  dedupe_key: string;
  user_id: string;
  meta: Record<string, unknown> | null;
}>;

/**
 * Expose only non-backfilled rows that classify as backfill_a (list history).
 * Never includes chat/owner/push-only/unknown.
 * Digit authority must NOT count these — use notification_events A only.
 */
export function selectLegacyRowsForTemporaryAdapter(
  legacyRows: readonly LegacyNotificationsBackfillRow[],
  canonicalDedupeKeys: ReadonlySet<string>
): {
  adapterRows: LegacyAdapterInboxShape[];
  remainingLegacyCount: number;
  excludedAlreadyCanonical: number;
} {
  const adapterRows: LegacyAdapterInboxShape[] = [];
  let excludedAlreadyCanonical = 0;

  for (const row of legacyRows) {
    const plan = classifyLegacyNotificationsRowForBackfill(row, { canonicalDedupeKeys });
    if (plan.disposition === "already_canonical") {
      excludedAlreadyCanonical += 1;
      continue;
    }
    if (plan.disposition !== "backfill_a" || !plan.proposed) continue;

    adapterRows.push({
      id: plan.legacyId,
      source: "legacy_adapter",
      notification_type: plan.proposed.type,
      title: plan.proposed.title,
      body: plan.proposed.body,
      link_url: plan.proposed.targetRoute,
      is_read: !plan.proposed.unread,
      created_at: plan.proposed.created_at,
      dedupe_key: plan.dedupeKey,
      user_id: plan.userId,
      meta: row.meta ?? null,
    });
  }

  return {
    adapterRows,
    remainingLegacyCount: adapterRows.length,
    excludedAlreadyCanonical,
  };
}

/**
 * A digit must ignore adapter rows — prove count identity uses events only.
 */
export function adapterDoesNotContributeToAuthorityDigit(
  eventUnreadCount: number,
  adapterUnreadCount: number
): number {
  void adapterUnreadCount;
  return Math.max(0, Math.floor(Number(eventUnreadCount) || 0));
}

export function isLegacyAdapterExpired(nowIso: string, expiryIso = LEGACY_ADAPTER_REMOVAL.adapterExpiry): boolean {
  const now = Date.parse(nowIso);
  const exp = Date.parse(expiryIso);
  if (!Number.isFinite(now) || !Number.isFinite(exp)) return false;
  return now >= exp;
}

export { legacyNotificationsDedupeKey };
