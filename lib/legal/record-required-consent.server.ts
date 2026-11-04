/**
 * Atomic required consent writer — profiles + member_consent_events via DB RPC (service role only).
 * Must never report success if ledger write failed / RPC missing.
 * Marketing is not written here — SSOT is `lib/legal/marketing-consent.server`.
 */
import type { MemberConsentEventSource } from "@/lib/legal/member-consent-events";

export type RecordRequiredConsentInput = {
  userId: string;
  termsVersion: string;
  privacyVersion: string;
  /** null = no age attestation in this submit (pre-policy member, or age already verified). */
  dateOfBirth: string | null;
  source: Extract<MemberConsentEventSource, "signup" | "reconsent">;
  /** When false, terms/privacy are already current — only age attestation is written. */
  updateTermsPrivacy?: boolean;
};

export type RecordRequiredConsentFailureCode =
  | "rpc_unavailable"
  | "age_under_minimum"
  | "dob_required"
  | "dob_invalid"
  | "profile_missing"
  | "consent_versions_required"
  | "record_failed";

export type RecordRequiredConsentResult =
  | {
      ok: true;
      idempotent: boolean;
      legacy: boolean;
      termsVersion: string | null;
      privacyVersion: string | null;
      recordedAt: string;
    }
  | {
      ok: false;
      code: RecordRequiredConsentFailureCode;
      message: string;
      httpStatus: 400 | 403 | 404 | 503 | 500;
    };

function mapRpcError(message: string): RecordRequiredConsentResult & { ok: false } {
  const msg = String(message ?? "");
  if (/age_under_minimum/i.test(msg)) {
    return { ok: false, code: "age_under_minimum", message: "만 14세 이상만 가입할 수 있습니다.", httpStatus: 403 };
  }
  if (/dob_required/i.test(msg)) {
    return { ok: false, code: "dob_required", message: "생년월일이 필요합니다.", httpStatus: 400 };
  }
  if (/dob_invalid/i.test(msg)) {
    return { ok: false, code: "dob_invalid", message: "생년월일이 올바르지 않습니다.", httpStatus: 400 };
  }
  if (/profile_missing/i.test(msg)) {
    return { ok: false, code: "profile_missing", message: "profile_missing_for_consent", httpStatus: 404 };
  }
  if (/consent_versions_required/i.test(msg)) {
    return {
      ok: false,
      code: "consent_versions_required",
      message: "약관 버전이 필요합니다.",
      httpStatus: 400,
    };
  }
  if (
    /record_member_required_consent/i.test(msg) &&
    /does not exist|schema cache|Could not find the function|permission denied/i.test(msg)
  ) {
    return {
      ok: false,
      code: "rpc_unavailable",
      message: "동의 기록 저장소가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      httpStatus: 503,
    };
  }
  return { ok: false, code: "record_failed", message: msg || "consent_record_failed", httpStatus: 500 };
}

export async function recordRequiredMemberConsentServer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service supabase client
  sb: any,
  input: RecordRequiredConsentInput,
): Promise<RecordRequiredConsentResult> {
  try {
    const { data, error } = await sb.rpc("record_member_required_consent", {
      p_user_id: input.userId,
      p_terms_version: input.termsVersion,
      p_privacy_version: input.privacyVersion,
      p_date_of_birth: input.dateOfBirth,
      p_source: input.source,
      p_agree_marketing: false,
      p_marketing_version: null,
      p_update_terms_privacy: input.updateTermsPrivacy !== false,
    });
    if (error) return mapRpcError(error.message ?? "");
    const row = (data ?? null) as Record<string, unknown> | null;
    if (row && row.ok === false && typeof row.code === "string") {
      return mapRpcError(row.code);
    }
    if (!row || row.ok !== true) {
      return { ok: false, code: "record_failed", message: "consent_record_empty", httpStatus: 500 };
    }
    return {
      ok: true,
      idempotent: row.idempotent === true,
      legacy: row.legacy === true,
      termsVersion: row.termsVersion != null ? String(row.termsVersion) : null,
      privacyVersion: row.privacyVersion != null ? String(row.privacyVersion) : null,
      recordedAt: String(row.recordedAt ?? new Date().toISOString()),
    };
  } catch (e) {
    return mapRpcError(e instanceof Error ? e.message : "consent_record_failed");
  }
}
