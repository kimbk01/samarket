/**
 * Catalog capability matrix + derived operationStatus.
 * available is NEVER stored manually — only derived.
 */

export type CapabilityProof = "proven" | "unproven" | "na";

export type SectionCapabilities = {
  list: CapabilityProof;
  detail: CapabilityProof;
  title: CapabilityProof;
  author: CapabilityProof;
  date: CapabilityProof;
  body: CapabilityProof;
  /** proven = thumb authority works; na = explicit no-thumb contract */
  thumb: CapabilityProof;
  /** proven = can detect/collect body images OR correctly determine none; na = explicit no-body-image */
  bodyImage: CapabilityProof;
  gallery: CapabilityProof;
  /** na = section does not support pagination (not critical) */
  pagination: CapabilityProof;
  language: CapabilityProof;
  publish: CapabilityProof;
};

export type OperationStatus = "available" | "needs_check" | "disabled";

const ALWAYS_CRITICAL: readonly (keyof SectionCapabilities)[] = [
  "list",
  "detail",
  "title",
  "author",
  "date",
  "body",
  "language",
  "publish",
];

export function unprovenCapabilities(
  overrides: Partial<SectionCapabilities> = {}
): SectionCapabilities {
  return {
    list: "unproven",
    detail: "unproven",
    title: "unproven",
    author: "unproven",
    date: "unproven",
    body: "unproven",
    thumb: "unproven",
    bodyImage: "unproven",
    gallery: "unproven",
    pagination: "unproven",
    language: "unproven",
    publish: "unproven",
    ...overrides,
  };
}

function criticalSatisfied(caps: SectionCapabilities, key: keyof SectionCapabilities): boolean {
  const v = caps[key];
  if (key === "pagination") {
    return v === "proven" || v === "na";
  }
  if (key === "thumb" || key === "bodyImage") {
    // proven = authority closed; na = explicit no-* contract
    return v === "proven" || v === "na";
  }
  if (key === "gallery") {
    // gallery is non-blocking unless we later promote it; treat na/proven as ok, unproven ok for CUT A critical set
    return true;
  }
  return v === "proven";
}

export function allCriticalCapabilitiesProven(caps: SectionCapabilities): boolean {
  for (const key of ALWAYS_CRITICAL) {
    if (!criticalSatisfied(caps, key)) return false;
  }
  if (!criticalSatisfied(caps, "thumb")) return false;
  if (!criticalSatisfied(caps, "bodyImage")) return false;
  if (!criticalSatisfied(caps, "pagination")) return false;
  return true;
}

export type DeriveOperationStatusInput = {
  capabilities: SectionCapabilities;
  adapterId: string | null;
  canonicalUrl: string | null;
  disabledOverride?: boolean;
};

/**
 * LOCK 1: available = derived only.
 */
export function deriveOperationStatus(input: DeriveOperationStatusInput): OperationStatus {
  if (input.disabledOverride) return "disabled";
  const url = String(input.canonicalUrl ?? "").trim();
  const adapter = String(input.adapterId ?? "").trim();
  if (
    allCriticalCapabilitiesProven(input.capabilities) &&
    adapter.length > 0 &&
    url.length > 0
  ) {
    return "available";
  }
  return "needs_check";
}

export function catalogCapabilityLabel(status: OperationStatus): string {
  if (status === "available") return "사용 가능";
  if (status === "disabled") return "사용 중지";
  return "확인 필요";
}
