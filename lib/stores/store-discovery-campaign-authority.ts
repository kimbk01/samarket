/**
 * P1-D B1/B2 — Period campaign discovery AUTHORITY.
 *
 * Cut A (delivery_fee_mode === "self_free_promo" / Slot3): PRESERVE — separate track.
 * store_banners: detail hero only — do not reuse.
 * stores.is_featured: PRESERVE — not Cut B.
 * Ads / point_promotion: OUT.
 *
 * Writer policy:
 * - OWNER WRITER POLICY: OWNER (create/update/deactivate authority — HTTP not in W)
 * - ADMIN WRITER: HTTP only (POST/PATCH /api/admin/store-discovery/campaigns)
 * - Consumer: existing home-feed loader + campaignFood (unchanged in W)
 */

export const STORE_DISCOVERY_CAMPAIGN_TABLE = "store_discovery_campaigns" as const;

export const STORE_DISCOVERY_CAMPAIGN_TYPES = ["event", "promo"] as const;
export type StoreDiscoveryCampaignType = (typeof STORE_DISCOVERY_CAMPAIGN_TYPES)[number];

export type StoreDiscoveryCampaignWriterRole = "owner" | "admin";
export type StoreDiscoveryCampaignWriteAction = "create" | "update" | "deactivate";

/**
 * OWNER WRITER POLICY: OWNER (future owner HTTP — out of W scope)
 * ADMIN WRITER: canonical HTTP path for W Campaign Writer
 */
export const STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY = {
  owner: { create: true, update: true, deactivate: true },
  admin: { create: true, update: true, deactivate: true },
} as const satisfies Record<
  StoreDiscoveryCampaignWriterRole,
  Record<StoreDiscoveryCampaignWriteAction, boolean>
>;

/** Implemented Admin HTTP route — no client direct Supabase writes. */
export const STORE_DISCOVERY_CAMPAIGN_HTTP_WRITER = "ADMIN_HTTP" as const;

export function canWriteStoreDiscoveryCampaign(
  role: StoreDiscoveryCampaignWriterRole,
  action: StoreDiscoveryCampaignWriteAction
): boolean {
  return STORE_DISCOVERY_CAMPAIGN_WRITER_POLICY[role][action] === true;
}

export function isStoreDiscoveryCampaignType(
  value: unknown
): value is StoreDiscoveryCampaignType {
  return value === "event" || value === "promo";
}

export type StoreDiscoveryCampaignWindowInput = {
  startAt: string | null | undefined;
  endAt: string | null | undefined;
};

/** Window invariant: both required and end_at > start_at. */
export function isValidStoreDiscoveryCampaignWindow(
  input: StoreDiscoveryCampaignWindowInput
): boolean {
  const startMs = parseRequiredInstant(input.startAt);
  const endMs = parseRequiredInstant(input.endAt);
  if (startMs == null || endMs == null) return false;
  return endMs > startMs;
}

export type StoreDiscoveryCampaignActiveInput = {
  isActive: boolean;
  startAt: string | null | undefined;
  endAt: string | null | undefined;
  /** Deterministic evaluation — omit for Date.now() */
  nowMs?: number;
};

/**
 * ACTIVE SIGNAL (product lock):
 * explicit is_active
 * AND start_at <= now
 * AND end_at > now
 */
export function isStoreDiscoveryCampaignActive(
  input: StoreDiscoveryCampaignActiveInput
): boolean {
  if (input.isActive !== true) return false;
  if (!isValidStoreDiscoveryCampaignWindow(input)) return false;
  const startMs = parseRequiredInstant(input.startAt);
  const endMs = parseRequiredInstant(input.endAt);
  if (startMs == null || endMs == null) return false;
  const nowMs = input.nowMs ?? Date.now();
  return startMs <= nowMs && endMs > nowMs;
}

/** HOME payload / selection row (authority projection). */
export type StoreDiscoveryCampaignAuthorityRow = {
  id: string;
  storeId: string;
  campaignType: StoreDiscoveryCampaignType;
  title: string;
  bodyCopy: string | null;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

/**
 * Multi-active deterministic pick (product lock):
 * end_at ASC → start_at DESC → campaign id ASC
 */
export function compareStoreDiscoveryCampaignsForHome(
  a: Pick<StoreDiscoveryCampaignAuthorityRow, "id" | "startAt" | "endAt">,
  b: Pick<StoreDiscoveryCampaignAuthorityRow, "id" | "startAt" | "endAt">
): number {
  const aEnd = parseRequiredInstant(a.endAt) ?? Number.POSITIVE_INFINITY;
  const bEnd = parseRequiredInstant(b.endAt) ?? Number.POSITIVE_INFINITY;
  if (aEnd !== bEnd) return aEnd - bEnd;
  const aStart = parseRequiredInstant(a.startAt) ?? 0;
  const bStart = parseRequiredInstant(b.startAt) ?? 0;
  if (aStart !== bStart) return bStart - aStart;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * Scope: only candidateStoreIds.
 * Active only. One campaign per store via deterministic compare.
 */
export function selectActiveStoreDiscoveryCampaignsForHome(
  rows: readonly StoreDiscoveryCampaignAuthorityRow[],
  candidateStoreIds: readonly string[],
  nowMs: number = Date.now()
): Map<string, StoreDiscoveryCampaignAuthorityRow> {
  const allowed = new Set(
    candidateStoreIds.map((id) => String(id).trim()).filter(Boolean)
  );
  const byStore = new Map<string, StoreDiscoveryCampaignAuthorityRow[]>();

  for (const row of rows) {
    const storeId = String(row.storeId ?? "").trim();
    if (!storeId || !allowed.has(storeId)) continue;
    if (!isStoreDiscoveryCampaignType(row.campaignType)) continue;
    if (
      !isStoreDiscoveryCampaignActive({
        isActive: row.isActive,
        startAt: row.startAt,
        endAt: row.endAt,
        nowMs,
      })
    ) {
      continue;
    }
    const list = byStore.get(storeId) ?? [];
    list.push(row);
    byStore.set(storeId, list);
  }

  const out = new Map<string, StoreDiscoveryCampaignAuthorityRow>();
  for (const [storeId, list] of byStore) {
    const sorted = [...list].sort(compareStoreDiscoveryCampaignsForHome);
    const pick = sorted[0];
    if (pick) out.set(storeId, pick);
  }
  return out;
}

function parseRequiredInstant(value: string | null | undefined): number | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}
