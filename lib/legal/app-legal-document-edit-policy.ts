/**
 * Admin Legal CMS — write rules (DIBAY FIRST ENTRY + ADMIN LEGAL CMS).
 *
 * CONTRACT (lib/legal/resolve-required-consent-versions.ts, docs/legal-consent-revision-policy.md):
 * - A revision of terms/privacy is a NEW version. Publishing a new ko version requires the Admin to
 *   choose its revision type: 'reconsent' (every member agrees again) or 'notice' (earlier consents
 *   back to the latest 'reconsent' version stay valid).
 * Rules enforced here so the member-facing record stays truthful:
 * - Draft rows never published: free edit; save keeps draft; publish requires explicit confirmation.
 * - terms/privacy rows once published (published or unpublished later): kind / locale / version /
 *   title / body / effective_at / revision type are fixed — what members agreed to never changes.
 *   Only unpublish / republish. DB trigger `app_legal_documents_published_immutable` enforces the same.
 * - marketing (optional consent): kind / locale / version / effective_at fixed once published;
 *   title/body edit under the same version only with explicit "no re-consent" confirmation
 *   (audit-logged with body hashes).
 * - Unpublish is its own action (never a side effect of "save draft") and requires confirmation.
 */
import { createHash } from "node:crypto";
import {
  isAppLegalKind,
  isAppLegalLocale,
  type AppLegalDocumentRow,
} from "@/lib/legal/app-legal-documents";

export type LegalDocPatchInput = {
  kind?: string;
  locale?: string;
  title?: string;
  body?: string;
  version?: string;
  status?: string;
  effective_at?: string | null;
  /** "unpublish" — take a published document off the member surface. */
  action?: string;
  /** UI confirmation for publish / unpublish. */
  confirm?: boolean;
  /** Published same-version text edit acknowledged as "no re-consent" (marketing only). */
  confirmNoReconsent?: boolean;
  /** Revision type of a new terms/privacy ko version — required on its first publish. */
  consentRequirement?: string;
};

export type LegalConsentRequirement = "reconsent" | "notice";

export function isLegalConsentRequirement(v: unknown): v is LegalConsentRequirement {
  return v === "reconsent" || v === "notice";
}

/** terms/privacy text is a consent record once published — never edited in place. */
export function isRequiredConsentLegalKind(kind: string | null | undefined): boolean {
  return kind === "terms" || kind === "privacy";
}

/** The consent gate follows ko versions only — ko terms/privacy publishes choose a revision type. */
export function legalPublishNeedsConsentRequirement(kind: string | null | undefined, locale: string | null | undefined): boolean {
  return isRequiredConsentLegalKind(kind) && locale === "ko";
}

/** Postgres / PostgREST error when `consent_requirement` is not applied yet (migration 20271106120000). */
export function isMissingConsentRequirementColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return /consent_requirement/i.test(error.message ?? "") && (error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message ?? ""));
}

/** DB trigger refusal for an in-place edit of a published terms/privacy document. */
export function isPublishedLegalImmutableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return /published_legal_document_immutable/i.test(error.message ?? "");
}

export type LegalDocWriteAction =
  | "save_draft"
  | "publish"
  | "unpublish"
  | "edit_published_same_version";

export type LegalDocPatchDecision =
  | { ok: true; action: LegalDocWriteAction; patch: Record<string, unknown> }
  | { ok: false; status: 400 | 409; error: string; message: string };

export function legalBodySha256(body: string | null | undefined): string {
  return createHash("sha256").update(String(body ?? ""), "utf8").digest("hex");
}

function deny(status: 400 | 409, error: string, message: string): LegalDocPatchDecision {
  return { ok: false, status, error, message };
}

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (!Number.isFinite(ta) && !Number.isFinite(tb)) return true;
  return ta === tb;
}

export function evaluateLegalDocumentPatch(
  current: AppLegalDocumentRow,
  input: LegalDocPatchInput,
  nowIso: string = new Date().toISOString(),
): LegalDocPatchDecision {
  const patch: Record<string, unknown> = { updated_at: nowIso };

  if (current.status === "published") {
    if (input.action === "unpublish") {
      if (input.confirm !== true) {
        return deny(400, "confirm_required", "게시 중단 확인이 필요합니다.");
      }
      return { ok: true, action: "unpublish", patch: { ...patch, status: "draft" } };
    }
    if (input.status != null && input.status !== "published") {
      return deny(
        409,
        "use_unpublish_action",
        "게시 중인 약관은 임시저장으로 내릴 수 없습니다. 「게시 중단」을 사용해 주세요.",
      );
    }
    const identityChanged =
      (input.kind != null && input.kind !== current.kind) ||
      (input.locale != null && input.locale !== current.locale) ||
      (input.version != null && String(input.version).trim() !== current.version) ||
      (input.effective_at !== undefined && !sameInstant(input.effective_at?.trim() || null, current.effective_at));
    if (identityChanged) {
      return deny(
        409,
        "published_identity_immutable",
        "게시된 약관의 종류·언어·버전·시행일은 바꿀 수 없습니다. 새 버전은 새 문서로 추가해 주세요.",
      );
    }
    const nextTitle = input.title != null ? String(input.title).trim().slice(0, 200) : current.title;
    const nextBody = input.body != null ? String(input.body).trim().slice(0, 100000) : current.body;
    if (!nextTitle || !nextBody) return deny(400, "invalid_input", "제목과 본문은 비울 수 없습니다.");
    if (nextTitle === current.title && nextBody === current.body) {
      return deny(400, "no_change", "변경된 내용이 없습니다.");
    }
    if (isRequiredConsentLegalKind(current.kind)) {
      return deny(
        409,
        "published_text_immutable",
        "게시된 이용약관·개인정보처리방침의 문구는 바꿀 수 없습니다. 개정은 새 버전 문서로 작성해 게시해 주세요.",
      );
    }
    if (input.confirmNoReconsent !== true) {
      return deny(
        400,
        "confirm_no_reconsent_required",
        "같은 버전으로 본문을 수정하면 회원 재동의가 발생하지 않습니다. 확인 후 다시 시도해 주세요.",
      );
    }
    return {
      ok: true,
      action: "edit_published_same_version",
      patch: { ...patch, title: nextTitle, body: nextBody },
    };
  }

  // draft
  if (input.action === "unpublish") return deny(409, "not_published", "게시 중인 문서가 아닙니다.");

  // Unpublished terms/privacy that members may have agreed to: republish only, nothing else changes.
  if (current.published_at && isRequiredConsentLegalKind(current.kind)) {
    const changed =
      (input.kind != null && input.kind !== current.kind) ||
      (input.locale != null && input.locale !== current.locale) ||
      (input.version != null && String(input.version).trim() !== current.version) ||
      (input.title != null && String(input.title).trim() !== current.title) ||
      (input.body != null && String(input.body).trim() !== current.body) ||
      (input.effective_at !== undefined && !sameInstant(input.effective_at?.trim() || null, current.effective_at)) ||
      (input.consentRequirement != null && input.consentRequirement !== current.consent_requirement);
    if (changed) {
      return deny(
        409,
        "published_text_immutable",
        "한 번 게시된 이용약관·개인정보처리방침은 바꿀 수 없습니다. 개정은 새 버전 문서로 작성해 게시해 주세요.",
      );
    }
    if (input.status !== "published") return deny(400, "no_change", "변경된 내용이 없습니다.");
    if (input.confirm !== true) return deny(400, "confirm_required", "게시 확인이 필요합니다.");
    return { ok: true, action: "publish", patch: { ...patch, status: "published", published_at: nowIso } };
  }

  if (input.kind != null) {
    if (!isAppLegalKind(input.kind)) return deny(400, "invalid_kind", "문서 종류가 올바르지 않습니다.");
    patch.kind = input.kind;
  }
  if (input.locale != null) {
    if (!isAppLegalLocale(input.locale)) return deny(400, "invalid_locale", "언어가 올바르지 않습니다.");
    patch.locale = input.locale;
  }
  if (input.title != null) patch.title = String(input.title).trim().slice(0, 200);
  if (input.body != null) patch.body = String(input.body).trim().slice(0, 100000);
  if (input.version != null) patch.version = String(input.version).trim().slice(0, 64);
  if (input.effective_at !== undefined) patch.effective_at = input.effective_at?.trim() || null;

  if (input.status === "published") {
    if (input.confirm !== true) return deny(400, "confirm_required", "게시 확인이 필요합니다.");
    const title = (patch.title as string | undefined) ?? current.title;
    const body = (patch.body as string | undefined) ?? current.body;
    const version = (patch.version as string | undefined) ?? current.version;
    if (!title || !body || !version) return deny(400, "invalid_input", "제목·본문·버전을 입력해 주세요.");
    const kind = (patch.kind as string | undefined) ?? current.kind;
    const locale = (patch.locale as string | undefined) ?? current.locale;
    if (legalPublishNeedsConsentRequirement(kind, locale)) {
      if (!isLegalConsentRequirement(input.consentRequirement)) {
        return deny(
          400,
          "consent_requirement_required",
          "개정 유형(재동의 필요 / 공지만)을 선택해 주세요.",
        );
      }
      patch.consent_requirement = input.consentRequirement;
    }
    patch.status = "published";
    patch.published_at = nowIso;
    if (!("effective_at" in patch) || !patch.effective_at) patch.effective_at = current.effective_at || nowIso;
    return { ok: true, action: "publish", patch };
  }
  patch.status = "draft";
  return { ok: true, action: "save_draft", patch };
}

/** Audit snapshot — never the full legal text, only its hash and identity. */
export function legalDocAuditSnapshot(row: Pick<
  AppLegalDocumentRow,
  "kind" | "locale" | "version" | "status" | "title" | "body" | "effective_at" | "published_at" | "consent_requirement"
> | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    kind: row.kind,
    locale: row.locale,
    version: row.version,
    status: row.status,
    consent_requirement: row.consent_requirement ?? null,
    title: row.title,
    effective_at: row.effective_at ?? null,
    published_at: row.published_at ?? null,
    body_sha256: legalBodySha256(row.body),
    body_length: String(row.body ?? "").length,
  };
}

/** Postgres unique violation on (kind, locale, version). */
export function isLegalVersionConflictError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /app_legal_documents_kind_locale_version/i.test(error.message ?? "");
}
