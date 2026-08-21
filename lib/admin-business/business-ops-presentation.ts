/**
 * Admin Business Operations — presentation only.
 * Reuses existing SSOTs; does NOT invent a merged DB status.
 */
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveStoreFrontCommerceState,
  type StoreFrontCommerceState,
} from "@/lib/stores/store-auto-hours";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export type BusinessOpsOpenKind = "open" | "closed" | "break" | "temp_closed";

export type BusinessOpsSettlementKind = "ok" | "needs_check" | "held";

export type BusinessOpsOwnerIdentity =
  | { ok: true; label: string; username: string | null; handle: string | null }
  | { ok: false; reason: "missing_profile" | "missing_owner" };

/** Human open state from front-open SSOT + DB is_open (temp close). */
export function presentStoreOpenKind(
  businessHoursJson: unknown,
  dbIsOpen: boolean | null | undefined,
  now: Date = new Date()
): { kind: BusinessOpsOpenKind; commerce: StoreFrontCommerceState } {
  const commerce = resolveStoreFrontCommerceState(businessHoursJson, dbIsOpen, now);
  if (dbIsOpen === false) {
    return { kind: "temp_closed", commerce };
  }
  if (commerce.inBreak) {
    return { kind: "break", commerce };
  }
  if (commerce.isOpenForCommerce) {
    return { kind: "open", commerce };
  }
  return { kind: "closed", commerce };
}

export function businessOpsOpenLabelKey(kind: BusinessOpsOpenKind): MessageKey {
  switch (kind) {
    case "open":
      return "admin_biz_ops_open_open";
    case "break":
      return "admin_biz_ops_open_break";
    case "temp_closed":
      return "admin_biz_ops_open_temp_closed";
    default:
      return "admin_biz_ops_open_closed";
  }
}

/**
 * Settlement attention from existing settlement_status values.
 * held → 보류; pending|processing → 확인 필요; else 정상.
 */
export function presentSettlementKind(statuses: string[]): BusinessOpsSettlementKind {
  const set = new Set(statuses.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (set.has("held")) return "held";
  if (set.has("pending") || set.has("processing") || set.has("scheduled")) return "needs_check";
  return "ok";
}

/** Display hours line from business_hours_json (Owner SSOT). */
export function hoursLabelFromBusinessHoursJson(businessHoursJson: unknown): string | null {
  if (!businessHoursJson || typeof businessHoursJson !== "object" || Array.isArray(businessHoursJson)) {
    return null;
  }
  const hoursRaw = businessHoursJson as Record<string, unknown>;
  const autoRec =
    hoursRaw.auto_business_hours &&
    typeof hoursRaw.auto_business_hours === "object" &&
    !Array.isArray(hoursRaw.auto_business_hours)
      ? (hoursRaw.auto_business_hours as Record<string, unknown>)
      : null;
  if (autoRec?.enabled === true && autoRec.schedule_enforced === true) {
    const open = typeof autoRec.open === "string" ? autoRec.open.trim() : "";
    const close = typeof autoRec.close === "string" ? autoRec.close.trim() : "";
    if (open && close) return `${open}-${close}`;
  }
  const wd =
    typeof hoursRaw.weekdays === "string"
      ? hoursRaw.weekdays.trim()
      : typeof hoursRaw.weekdays_hours === "string"
        ? hoursRaw.weekdays_hours.trim()
        : "";
  return wd || null;
}

export function businessOpsSettlementLabelKey(kind: BusinessOpsSettlementKind): MessageKey {
  switch (kind) {
    case "held":
      return "admin_biz_ops_settle_held";
    case "needs_check":
      return "admin_biz_ops_settle_needs_check";
    default:
      return "admin_biz_ops_settle_ok";
  }
}

export function resolveBusinessOpsOwnerIdentity(input: {
  ownerUserId: string | null | undefined;
  displayName?: string | null;
  nickname?: string | null;
  username?: string | null;
}): BusinessOpsOwnerIdentity {
  const ownerUserId = String(input.ownerUserId ?? "").trim();
  if (!ownerUserId) return { ok: false, reason: "missing_owner" };
  const display = String(input.displayName ?? input.nickname ?? "").trim();
  const username = String(input.username ?? "")
    .trim()
    .replace(/^@+/, "");
  const label = labelFromDisplayAndUsername(display || null, username || null).trim();
  if (!label) return { ok: false, reason: "missing_profile" };
  return {
    ok: true,
    label,
    username: username || null,
    handle: username ? `@${username}` : null,
  };
}

export function formatRegionLine(input: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
}): string {
  const parts = [input.region, input.city, input.district]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.join(" · ") || "";
}

/** List row only — city (fallback region). Never dump street/district/full address. */
export function formatOpsListCityLine(input: {
  city?: string | null;
  region?: string | null;
}): string {
  const city = typeof input.city === "string" ? input.city.trim() : "";
  if (city) return city;
  const region = typeof input.region === "string" ? input.region.trim() : "";
  return region;
}

/** Detail identity — full human location (structured + formatted, de-duplicated). */
export function formatOpsDetailAddressLine(input: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  detail_address?: string | null;
  formatted_address?: string | null;
}): string {
  const structured = [
    input.region,
    input.city,
    input.district,
    input.address_line1,
    input.address_line2,
    input.detail_address,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  const unique: string[] = [];
  for (const part of structured) {
    if (unique.some((u) => u === part || u.includes(part) || part.includes(u))) continue;
    unique.push(part);
  }
  const joined = unique.join(" · ");
  const formatted =
    typeof input.formatted_address === "string" ? input.formatted_address.trim() : "";
  if (!formatted) return joined;
  if (!joined) return formatted;
  if (formatted === joined || formatted.includes(joined) || joined.includes(formatted)) {
    return formatted.length >= joined.length ? formatted : joined;
  }
  return `${joined} · ${formatted}`;
}

export function taxonomyName(
  rel:
    | { name?: string | null; name_en?: string | null }
    | { name?: string | null; name_en?: string | null }[]
    | null
    | undefined
): string {
  const row = Array.isArray(rel) ? rel[0] : rel;
  if (!row) return "";
  return String(row.name ?? row.name_en ?? "").trim();
}

/** Approval pending family used by list KPI / filters. */
export const BUSINESS_OPS_PENDING_APPROVAL = [
  "pending",
  "under_review",
  "revision_requested",
] as const;

export const BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES = [
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
] as const;

export const BUSINESS_OPS_DELIVERING_ORDER_STATUSES = ["delivering", "arrived"] as const;
