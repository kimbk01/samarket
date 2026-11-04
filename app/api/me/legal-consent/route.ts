import { NextRequest } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { ensurePendingAuthProfileRow } from "@/lib/auth/member-access";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import {
  resolveRequiredConsentVersions,
  resolveRequiredConsentVersionsStrict,
} from "@/lib/legal/resolve-required-consent-versions";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import {
  loadMarketingConsentDoc,
  readMemberMarketingConsent,
  writeMemberMarketingConsent,
} from "@/lib/legal/marketing-consent.server";
import {
  evaluateAgeAttestationInput,
  hasAgeGateConsent,
} from "@/lib/legal/member-age-gate";
import { readMemberAgeGateState } from "@/lib/legal/member-age-gate-legacy.server";
import { recordRequiredMemberConsentServer } from "@/lib/legal/record-required-consent.server";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { enforceLegalConsentSubmitQuota } from "@/lib/security/rate-limit-presets";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const routeSb = await createSupabaseRouteHandlerClient();
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (!readSb) return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  const [profile, required, ageState] = await Promise.all([
    fetchProfileRowSafe(readSb, auth.userId),
    resolveRequiredConsentVersions(),
    readMemberAgeGateState(readSb, auth.userId),
  ]);
  const complete = hasStoreTermsConsent(
    {
      terms_accepted_at: profile?.terms_accepted_at ?? null,
      terms_version: profile?.terms_version ?? null,
      privacy_accepted_at: profile?.privacy_accepted_at ?? null,
      privacy_version: profile?.privacy_version ?? null,
    },
    required,
  );
  return jsonOk({
    consent: {
      termsAcceptedAt: profile?.terms_accepted_at ?? null,
      termsVersion: profile?.terms_version ?? null,
      privacyAcceptedAt: profile?.privacy_accepted_at ?? null,
      privacyVersion: profile?.privacy_version ?? null,
      requiredTermsVersion: required.termsVersion,
      requiredPrivacyVersion: required.privacyVersion,
      requiredSource: required.source,
      complete,
    },
    ageGate: ageState.ok
      ? {
          legacyMember: ageState.fields.age_gate_legacy,
          status: ageState.fields.age_gate_status ?? null,
          attestedAt: ageState.fields.age_attested_at ?? null,
          complete: hasAgeGateConsent(ageState.fields),
        }
      : null,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const routeSb = await createSupabaseRouteHandlerClient();
  if (!routeSb) return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });
  let body: {
    agreeTerms?: boolean;
    agreePrivacy?: boolean;
    termsVersion?: unknown;
    privacyVersion?: unknown;
    /** 혜택·이벤트 수신 동의(선택) — 가입 화면에 보였을 때만 온다. */
    agreeMarketing?: unknown;
    marketingVersion?: unknown;
    /** 만 14세 이상 자기신고 + 생년월일 — 연령 확인이 필요한 회원만 (기존 회원은 서버가 무시). */
    attestAge?: unknown;
    dateOfBirth?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
  const {
    data: { user },
  } = await routeSb.auth.getUser();
  if (!user?.id || user.id !== auth.userId) {
    return jsonError("로그인이 필요합니다.", 401, { authenticated: false });
  }
  const quota = await enforceLegalConsentSubmitQuota(auth.userId);
  if (!quota.ok) return quota.response;
  const sb = tryCreateSupabaseServiceClient() ?? routeSb;
  // Record only a version the CMS actually requires now — never a fallback guessed on read failure.
  let required: Awaited<ReturnType<typeof resolveRequiredConsentVersionsStrict>>;
  try {
    required = await resolveRequiredConsentVersionsStrict();
  } catch {
    return jsonError("약관 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.", 503, {
      code: "consent_versions_unavailable",
    });
  }
  // P7: the member agrees to the versions shown on screen. If an Admin published a newer version
  // while the screen was open, do not record the newer version as agreed — ask to review again.
  const seenTerms = typeof body.termsVersion === "string" ? body.termsVersion.trim() : "";
  const seenPrivacy = typeof body.privacyVersion === "string" ? body.privacyVersion.trim() : "";
  if (
    (seenTerms && seenTerms !== required.termsVersion) ||
    (seenPrivacy && seenPrivacy !== required.privacyVersion)
  ) {
    return jsonError("약관이 개정되었습니다. 변경된 약관을 확인한 뒤 다시 동의해 주세요.", 409, {
      code: "consent_version_stale",
      requiredConsent: { termsVersion: required.termsVersion, privacyVersion: required.privacyVersion },
    });
  }

  /**
   * 혜택·이벤트 선택 동의 기록 (Owner 2026-11-03) — 기록이 한 번도 없는 회원(신규 가입)만 저장.
   * 이미 기록이 있으면(기존 회원 기본 동의 · 내정보 변경) 덮지 않는다.
   * 저장·조회에 실패하면 `false` → 응답을 실패로 돌려 화면이 머물고 다시 시도하게 한다(재감사 D-1).
   * 기록 버전 = 서버가 읽은 게시 문서 버전(클라이언트 값을 믿지 않음 · D-5).
   */
  const recordSignupMarketingChoice = async (): Promise<boolean | null> => {
    if (typeof body.agreeMarketing !== "boolean") return null;
    const current = await readMemberMarketingConsent(sb, auth.userId);
    if (!current.ok) return false;
    if (current.consent?.source) return null;
    const doc = await loadMarketingConsentDoc();
    const saved = await writeMemberMarketingConsent(sb, auth.userId, {
      enabled: body.agreeMarketing,
      source: "signup",
      version: doc.version,
    });
    if (!saved.ok) console.warn("[legal-consent] marketing consent save failed", { code: saved.error });
    return saved.ok;
  };
  const marketingSaveFailed = () =>
    jsonError("선택 동의를 저장하지 못했습니다. 다시 시도해 주세요.", 500, { code: "marketing_save_failed" });

  const existing = await fetchProfileRowSafe(sb, auth.userId);
  const termsOk = hasStoreTermsConsent(
    {
      terms_accepted_at: existing?.terms_accepted_at ?? null,
      terms_version: existing?.terms_version ?? null,
      privacy_accepted_at: existing?.privacy_accepted_at ?? null,
      privacy_version: existing?.privacy_version ?? null,
    },
    required,
  );
  const ageState = await readMemberAgeGateState(sb, auth.userId);
  if (!ageState.ok) return ageStateUnavailable();
  const ageOk = hasAgeGateConsent(ageState.fields);

  if (!termsOk && (body.agreeTerms !== true || body.agreePrivacy !== true)) {
    return jsonError("이용약관과 개인정보처리방침 동의가 필요합니다.", 400);
  }
  let dateOfBirth: string | null = null;
  if (!ageOk) {
    const decision = evaluateAgeAttestationInput({ attestAge: body.attestAge, dateOfBirth: body.dateOfBirth });
    // Under-14: refused before any write (no DOB, no optional consent). The RPC refuses it again.
    if (!decision.ok) {
      return jsonError(decision.messageKo, decision.code === "age_under_minimum" ? 403 : 400, {
        code: decision.code,
      });
    }
    dateOfBirth = decision.dateOfBirth;
  }

  if (termsOk && ageOk) {
    const marketingSaved = await recordSignupMarketingChoice();
    if (marketingSaved === false) return marketingSaveFailed();
    return jsonOk({
      ok: true,
      idempotent: true,
      marketingSaved,
      consent: {
        termsAcceptedAt: existing?.terms_accepted_at ?? null,
        termsVersion: existing?.terms_version ?? null,
        privacyAcceptedAt: existing?.privacy_accepted_at ?? null,
        privacyVersion: existing?.privacy_version ?? null,
        requiredTermsVersion: required.termsVersion,
        requiredPrivacyVersion: required.privacyVersion,
        complete: true,
      },
    });
  }

  try {
    await ensurePendingAuthProfileRow(sb, user);
  } catch {
    /* 다음 update 에서 검증 */
  }

  // 확정 설계 B-14 — 선택(혜택·이벤트) 동의를 **먼저** 저장한다. 실패하면 필수 동의도 저장하지 않고 실패로 돌려
  // 다음 방문 때 동의 화면이 다시 나와 다시 묻는다(예전: 필수만 저장돼 선택 동의를 영영 묻지 않았다).
  const marketingSaved = await recordSignupMarketingChoice();
  if (marketingSaved === false) return marketingSaveFailed();

  const recorded = await recordRequiredMemberConsentServer(sb, {
    userId: auth.userId,
    termsVersion: required.termsVersion,
    privacyVersion: required.privacyVersion,
    dateOfBirth,
    source: existing?.terms_accepted_at ? "reconsent" : "signup",
    updateTermsPrivacy: !termsOk,
  });
  if (!recorded.ok) return jsonError(recorded.message, recorded.httpStatus, { code: recorded.code });

  const termsAt = termsOk ? existing?.terms_accepted_at ?? null : recorded.recordedAt;
  const privacyAt = termsOk ? existing?.privacy_accepted_at ?? null : recorded.recordedAt;
  return jsonOk({
    marketingSaved,
    consent: {
      termsAcceptedAt: termsAt,
      termsVersion: required.termsVersion,
      privacyAcceptedAt: privacyAt,
      privacyVersion: required.privacyVersion,
      requiredTermsVersion: required.termsVersion,
      requiredPrivacyVersion: required.privacyVersion,
      complete: true,
    },
  });
}

const ageStateUnavailable = () =>
  jsonError("동의 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.", 503, {
    code: "consent_state_unavailable",
  });
