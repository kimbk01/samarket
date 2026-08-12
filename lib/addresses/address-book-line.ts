import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { FormatPhAddressCardOneLineOpts } from "@/lib/addresses/ph-address-display";

function stripCountrySuffix(line: string, countryName?: string | null): string {
  let t = line.trim();
  if (!t) return t;
  const names = [
    ...(countryName?.trim() ? [countryName.trim()] : []),
    "필리핀",
    "Philippines",
    "the Philippines",
    "Republic of the Philippines",
    "PHILIPPINES",
  ];
  for (const name of names.sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`[,，]\\s*${escaped}\\s*$`, "i"), "").trim();
    t = t.replace(new RegExp(`\\s+${escaped}\\s*$`, "i"), "").trim();
  }
  return t.replace(/[,，]\s*$/, "").trim();
}

/**
 * ADDRESS BOOK COMPACT FLOW SSOT — owner compact display.
 *
 * - Continuous comma-joined address string (NOT “forced one visual row”)
 * - Natural wrap by container width (1/2/3+ rows as needed)
 * - Country excluded (PHILIPPINES / Philippines / …)
 * - User detail (unit/room/floor) first; UI bolds `detail` only (inline)
 * - NOT for Community/Trade PUBLIC (use `formatPublicAddress`)
 * - NOT for Delivery multi-line (use `formatDeliveryAddress`)
 */

export type AddressBookLineSegments = {
  /** User-entered unit/room/floor/detail — bold in UI */
  detail: string | null;
  /** Street → subdivision → barangay → city → province */
  rest: string | null;
  /** `${detail}, ${rest}` or whichever exists — never includes country */
  plain: string;
};

function cleanToken(s: string | null | undefined): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  if (lower === "null" || lower === "undefined") return "";
  return t;
}

function isCountryToken(s: string): boolean {
  return /^(philippines|필리핀|the\s+philippines|republic\s+of\s+the\s+philippines|ph|phl)$/i.test(s);
}

function pushUnique(tokens: string[], raw: string | null | undefined): void {
  const t = cleanToken(raw);
  if (!t || isCountryToken(t)) return;
  const lower = t.toLowerCase();
  if (tokens.some((x) => x.toLowerCase() === lower)) return;
  tokens.push(t);
}

function resolveUserDetail(a: UserAddressDTO): string | null {
  const unit = cleanToken(a.unitFloorRoom);
  const detail = cleanToken(a.detailAddress);
  const parts: string[] = [];
  if (unit) parts.push(unit);
  if (detail && detail.toLowerCase() !== unit.toLowerCase()) parts.push(detail);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildStructuredRest(a: UserAddressDTO, opts?: FormatPhAddressCardOneLineOpts | null): string[] {
  const tokens: string[] = [];
  pushUnique(tokens, a.streetAddress);

  const storeHead = opts?.suppressGateBuildingIfMatchesSamarketStore?.trim() ?? "";
  const building = cleanToken(a.buildingName);
  const landmark = cleanToken(a.landmark);
  const subdivision = building || landmark;
  if (
    subdivision &&
    !(a.labelType === "shop" && storeHead && subdivision.toLowerCase() === storeHead.toLowerCase())
  ) {
    pushUnique(tokens, subdivision);
  }

  const barangay = cleanToken(a.barangay);
  if (barangay) {
    pushUnique(
      tokens,
      /^barangay\b/i.test(barangay) || /^brgy\.?\b/i.test(barangay) ? barangay : `Barangay ${barangay}`,
    );
  }

  pushUnique(tokens, a.cityMunicipality);
  pushUnique(tokens, a.province);
  return tokens;
}

function peelDetailPrefix(line: string, detail: string | null): { detail: string | null; rest: string } {
  const core = stripCountrySuffix(line).trim();

  if (!core) return { detail: null, rest: "" };
  if (!detail) return { detail: null, rest: core };
  const lower = core.toLowerCase();
  const d = detail.toLowerCase();
  if (lower === d) return { detail, rest: "" };
  if (lower.startsWith(`${d},`) || lower.startsWith(`${d}，`)) {
    return { detail, rest: core.slice(detail.length).replace(/^[,，]\s*/, "").trim() };
  }
  return { detail, rest: core };
}

/**
 * Address book compact segments — detail boldable, country excluded.
 */
export function formatAddressBookLineSegments(
  a: UserAddressDTO | null | undefined,
  opts?: FormatPhAddressCardOneLineOpts | null,
): AddressBookLineSegments | null {
  if (!a?.id) return null;

  const detail = resolveUserDetail(a);
  const structuredRest = buildStructuredRest(a, opts).filter((t) => {
    if (!detail) return true;
    return t.toLowerCase() !== detail.toLowerCase();
  });

  if (structuredRest.length > 0) {
    const rest = structuredRest.join(", ").trim() || null;
    const plain = [detail, rest].filter(Boolean).join(", ");
    if (!plain) return null;
    return { detail, rest, plain };
  }

  const fallbackRaw =
    cleanToken(a.formattedAddress) ||
    cleanToken(a.fullAddress) ||
    cleanToken(a.roadAddress) ||
    "";
  if (fallbackRaw) {
    const peeled = peelDetailPrefix(stripCountrySuffix(fallbackRaw, a.countryName), detail);
    const rest = peeled.rest.trim() || null;
    const plain = [peeled.detail ?? detail, rest].filter(Boolean).join(", ");
    if (plain) {
      return { detail: peeled.detail ?? detail, rest, plain };
    }
  }

  if (detail) {
    return { detail, rest: null, plain: detail };
  }

  return null;
}

/** Compact continuous address plain (country excluded). Natural CSS wrap — not forced single visual row. */
export function formatAddressBookLine(
  a: UserAddressDTO | null | undefined,
  opts?: FormatPhAddressCardOneLineOpts | null,
): string | null {
  return formatAddressBookLineSegments(a, opts)?.plain ?? null;
}
