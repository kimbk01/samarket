/**
 * Support guidance semantic authority (PHASE 3-A).
 * CTA fail-closed. No app_notices coupling. No full CMS versioning.
 */

export const SUPPORT_GUIDANCE_CTA_KINDS = [
  "NONE",
  "INTERNAL_ROUTE",
  "DOMAIN_ENTITY",
] as const;

export type SupportGuidanceCtaKind = (typeof SUPPORT_GUIDANCE_CTA_KINDS)[number];

export const SUPPORT_GUIDANCE_OUTCOMES = [
  "RESOLVED_BY_GUIDANCE",
  "ESCALATED_TO_HUMAN",
  "SKIPPED",
] as const;

export type SupportGuidanceOutcome = (typeof SUPPORT_GUIDANCE_OUTCOMES)[number];

export type SupportGuidanceEntryRow = {
  id: string;
  audience: "MEMBER" | "OWNER";
  category: string;
  issue_type: string;
  title: string;
  body: string;
  enabled: boolean;
  sort_order: number;
  cta_kind: SupportGuidanceCtaKind;
  cta_target: string | null;
  escalation_allowed: boolean;
  revision: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GuidanceCtaValidation =
  | { ok: true; kind: SupportGuidanceCtaKind; target: string | null }
  | { ok: false; error: string };

/**
 * Fail-closed CTA validation.
 * NONE → target must be empty/null
 * INTERNAL_ROUTE → absolute app path starting with `/`, no scheme
 * DOMAIN_ENTITY → `TYPE:uuid` where TYPE is uppercase snake; no URLs
 */
export function validateSupportGuidanceCta(
  kindRaw: string | null | undefined,
  targetRaw: string | null | undefined
): GuidanceCtaValidation {
  const kind = typeof kindRaw === "string" ? kindRaw.trim().toUpperCase() : "";
  const target = typeof targetRaw === "string" ? targetRaw.trim() : "";

  if (!(SUPPORT_GUIDANCE_CTA_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: "invalid_cta_kind" };
  }

  const k = kind as SupportGuidanceCtaKind;

  if (k === "NONE") {
    if (target) return { ok: false, error: "cta_target_must_be_empty" };
    return { ok: true, kind: k, target: null };
  }

  if (!target) return { ok: false, error: "missing_cta_target" };

  // Block arbitrary URLs / schemes for all non-NONE kinds.
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.includes("://")) {
    return { ok: false, error: "cta_url_forbidden" };
  }

  if (k === "INTERNAL_ROUTE") {
    if (!target.startsWith("/") || target.startsWith("//")) {
      return { ok: false, error: "invalid_internal_route" };
    }
    return { ok: true, kind: k, target };
  }

  // DOMAIN_ENTITY: ENTITY_TYPE:id (uuid or non-empty opaque id without spaces)
  if (!/^[A-Z][A-Z0-9_]{1,63}:[A-Za-z0-9_.-]{1,128}$/.test(target)) {
    return { ok: false, error: "invalid_domain_entity_target" };
  }
  return { ok: true, kind: k, target };
}

export type GuidanceOpenConsistencyInput = {
  entry: Pick<
    SupportGuidanceEntryRow,
    "id" | "audience" | "category" | "issue_type" | "enabled" | "revision"
  >;
  audience: "MEMBER" | "OWNER";
  category: string;
  issueType: string | null;
  guidanceKey: string;
  guidanceRevision?: number | null;
  requireEnabled?: boolean;
};

export type GuidanceOpenConsistencyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Case-open guidance metadata must match an existing entry (fail-closed).
 */
export function assertGuidanceOpenConsistency(
  input: GuidanceOpenConsistencyInput
): GuidanceOpenConsistencyResult {
  const key = input.guidanceKey.trim();
  if (!key || key !== input.entry.id) {
    return { ok: false, error: "guidance_not_found" };
  }
  if (input.requireEnabled !== false && !input.entry.enabled) {
    return { ok: false, error: "guidance_disabled" };
  }
  if (input.entry.audience !== input.audience) {
    return { ok: false, error: "guidance_audience_mismatch" };
  }
  if (input.entry.category !== input.category) {
    return { ok: false, error: "guidance_category_mismatch" };
  }
  const issue = input.issueType?.trim() || "";
  if (!issue || input.entry.issue_type !== issue) {
    return { ok: false, error: "guidance_issue_mismatch" };
  }
  if (
    input.guidanceRevision != null &&
    Number(input.guidanceRevision) !== Number(input.entry.revision)
  ) {
    return { ok: false, error: "guidance_revision_mismatch" };
  }
  return { ok: true };
}

export function isSupportGuidanceOutcome(
  value: string | null | undefined
): value is SupportGuidanceOutcome {
  return (
    typeof value === "string" &&
    (SUPPORT_GUIDANCE_OUTCOMES as readonly string[]).includes(value.trim())
  );
}
