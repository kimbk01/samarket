/**
 * R14 PRECHECK-B — Owner Live eligibility at the mutation boundary.
 *
 * Authoritative content class lives on `app_intro_documents.content_class`
 * (OWNER | QA | SYSTEM). Release rows do not store content_class; eligibility
 * is derived via revision.document_id → document.content_class.
 *
 * Fail closed: only the exact persisted class OWNER may become Owner Live.
 * Do not trust caller-supplied contentClass. Do not coerce unknown → OWNER.
 */

export const OWNER_LIVE_FORBIDDEN_CONTENT_CLASS =
  "owner_live_forbidden_content_class" as const;

export type OwnerLiveEligibility =
  | { readonly ok: true; readonly contentClass: "OWNER" }
  | {
      readonly ok: false;
      readonly reason: typeof OWNER_LIVE_FORBIDDEN_CONTENT_CLASS;
      readonly contentClass: string;
      readonly message: string;
    };

/**
 * Exact Owner Live gate — unknown / empty / QA / SYSTEM / SYSTEM_BOOTSTRAP / TEST
 * all fail closed. Unlike list normalize, invalid values MUST NOT become OWNER.
 */
export function evaluateOwnerLiveContentClass(
  persistedContentClass: unknown,
): OwnerLiveEligibility {
  if (typeof persistedContentClass !== "string") {
    return {
      ok: false,
      reason: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
      contentClass: "missing",
      message: `${OWNER_LIVE_FORBIDDEN_CONTENT_CLASS}:missing`,
    };
  }
  const cls = persistedContentClass.trim().toUpperCase();
  if (cls === "OWNER") {
    return { ok: true, contentClass: "OWNER" };
  }
  const label = cls.length > 0 ? cls : "empty";
  return {
    ok: false,
    reason: OWNER_LIVE_FORBIDDEN_CONTENT_CLASS,
    contentClass: label,
    message: `${OWNER_LIVE_FORBIDDEN_CONTENT_CLASS}:${label}`,
  };
}

export function ownerLiveForbiddenError(contentClass: string): Error & {
  status: number;
  code: typeof OWNER_LIVE_FORBIDDEN_CONTENT_CLASS;
} {
  const err = new Error(
    `${OWNER_LIVE_FORBIDDEN_CONTENT_CLASS}:${contentClass}`,
  ) as Error & {
    status: number;
    code: typeof OWNER_LIVE_FORBIDDEN_CONTENT_CLASS;
  };
  err.status = 403;
  err.code = OWNER_LIVE_FORBIDDEN_CONTENT_CLASS;
  return err;
}
