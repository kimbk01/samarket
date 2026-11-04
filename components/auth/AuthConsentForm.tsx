"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOnboardingOverlayShell } from "@/components/auth/DibayOnboardingOverlayShell";
import { ConsentLegalDocSheet } from "@/components/legal/ConsentLegalDocSheet";
import { invalidateMeProfileDedupedCache, fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ProfileRow } from "@/lib/profile/types";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { markSignupConsentResolvedSession } from "@/lib/auth/signup-gate-session";
import { notifyLegalConsentCompleted } from "@/lib/auth/client-consent-state";
import { setClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";
import type { RequiredConsentGap } from "@/lib/legal/has-required-member-consents";
import type { AppLegalKind } from "@/lib/legal/app-legal-documents";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { MYPAGE_HOME_ACCOUNT_LEAVE_HREF } from "@/lib/mypage/mypage-home-hub-links";
import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import {
  DIBAY_ONBOARDING_CHECKBOX_CLASS,
  DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS,
  DIBAY_ONBOARDING_ERROR_CLASS,
  DIBAY_ONBOARDING_LABEL_CLASS,
  DIBAY_ONBOARDING_LINK_CLASS,
  DIBAY_ONBOARDING_NOTICE_CLASS,
  DIBAY_ONBOARDING_PRIMARY_BTN,
} from "@/lib/ui/dibay-onboarding-starbucks-styles";

/**
 * Owner-approved consent UX (mockup 2026-11-05).
 * Required: terms + privacy (+ age 14+ with DOB for members after the age policy). Optional: marketing (default off).
 * Legal docs open in an in-app sheet (checkbox state preserved).
 */
export function AuthConsentForm({
  requiredVersions,
  marketing,
  consentGap = "terms_privacy_and_age",
  priorConsent = false,
}: {
  /** Versions the server required when this screen rendered — sent back so a stale screen cannot record a newer version (P7). */
  requiredVersions?: { termsVersion: string; privacyVersion: string } | null;
  /**
   * 혜택·이벤트 수신 동의(선택) — 동의 기록이 없는 회원에게만 (Owner 2026-11-03). 문구 = 어드민 marketing 문서.
   * null = 묻지 않음(이미 기록 있음 · 약관 개정 재동의).
   */
  marketing?: { version: string; title: { ko: string; en: string } } | null;
  /** Server-decided missing items. Pre-policy members never get an age gap. */
  consentGap?: Exclude<RequiredConsentGap, null>;
  /** Member already accepted terms once — reconsent / age-only (in-session), not first signup. */
  priorConsent?: boolean;
} = {}) {
  const { t, safeT, language } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawNext = searchParams.get("next")?.trim() || POST_LOGIN_PATH;
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : POST_LOGIN_PATH;

  const needsLegal = consentGap !== "age";
  const needsAge = consentGap !== "terms_privacy";
  const ageOnly = consentGap === "age";
  const isReconsent = priorConsent && !ageOnly;

  const [agreeAll, setAgreeAll] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(!needsLegal);
  const [agreePrivacy, setAgreePrivacy] = useState(!needsLegal);
  const [attestAge, setAttestAge] = useState(!needsAge);
  const [dateOfBirth, setDateOfBirth] = useState("");
  /** Apple 4.5.4 「명시적 동의」 — 처음엔 체크 안 됨. */
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [shownVersions, setShownVersions] = useState(requiredVersions ?? null);
  const [sheetKind, setSheetKind] = useState<AppLegalKind | null>(null);

  const requiredOk =
    (!needsLegal || (agreeTerms && agreePrivacy)) && (!needsAge || (attestAge && Boolean(dateOfBirth.trim())));

  const syncAllFromParts = (terms: boolean, privacy: boolean, age: boolean, mkt: boolean) => {
    setAgreeAll(terms && privacy && age && (!marketing || mkt));
  };

  const onToggleAll = (checked: boolean) => {
    setAgreeAll(checked);
    if (needsLegal) {
      setAgreeTerms(checked);
      setAgreePrivacy(checked);
    }
    if (needsAge) setAttestAge(checked);
    if (marketing) setAgreeMarketing(checked);
  };

  const tagReq = useMemo(
    () => (
      <span className="mr-1 inline-block rounded-ui-rect bg-sam-primary-soft px-1.5 py-0.5 text-[11px] font-extrabold text-sam-primary">
        {t("auth_consent_tag_required")}
      </span>
    ),
    [t],
  );
  const tagOpt = useMemo(
    () => (
      <span className="mr-1 inline-block rounded-ui-rect bg-sam-surface-muted px-1.5 py-0.5 text-[11px] font-extrabold text-sam-muted">
        {t("auth_consent_tag_optional")}
      </span>
    ),
    [t],
  );

  const ageRequiredMessage = () =>
    safeT("auth_consent_age_required", {
      fallbackKo: "만 14세 이상 확인과 생년월일을 입력해 주세요.",
      fallbackEn: "Confirm you are 14+ and enter your date of birth.",
    });
  const underageMessage = () =>
    safeT("auth_consent_age_under_minimum", {
      fallbackKo: "만 14세 이상만 가입할 수 있습니다.",
      fallbackEn: "You must be at least 14 years old to join.",
    });
  const handleSubmit = async () => {
    if (inFlightRef.current || submitting) return;
    if (needsLegal && (!agreeTerms || !agreePrivacy)) {
      setError(t("auth_consent_both_required"));
      return;
    }
    if (needsAge && (!attestAge || !dateOfBirth.trim())) {
      setError(ageRequiredMessage());
      return;
    }
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/legal-consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agreeTerms: needsLegal ? true : undefined,
          agreePrivacy: needsLegal ? true : undefined,
          ...(needsAge ? { attestAge: true, dateOfBirth: dateOfBirth.trim() } : {}),
          ...(marketing ? { agreeMarketing, marketingVersion: marketing.version } : {}),
          ...(shownVersions
            ? { termsVersion: shownVersions.termsVersion, privacyVersion: shownVersions.privacyVersion }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        code?: string;
        requiredConsent?: { termsVersion: string; privacyVersion: string };
      } | null;
      if (res.status === 409 && data?.code === "consent_version_stale") {
        // Terms were revised while this screen was open — ask the member to review and agree again.
        if (data.requiredConsent) {
          setShownVersions(data.requiredConsent);
          setClientRequiredConsentVersions(data.requiredConsent);
        }
        setAgreeAll(false);
        setAgreeTerms(false);
        setAgreePrivacy(false);
        setError(t("auth_consent_version_stale"));
        return;
      }
      if (data?.code === "age_under_minimum") {
        setError(underageMessage());
        return;
      }
      if (data?.code === "dob_required" || data?.code === "dob_invalid") {
        setError(ageRequiredMessage());
        return;
      }
      if (data?.code === "marketing_save_failed") {
        // 선택 동의만 실패 — 필수도 저장하지 않았다. 화면에 머물러 다시 누르게 한다(재감사 D-1).
        setError(t("auth_consent_marketing_save_failed"));
        return;
      }
      if (!res.ok || !data?.ok) {
        // 서버 원문·코드는 화면에 노출하지 않는다 — 로그로만 (§5.6).
        console.warn("[auth-consent] save failed", { status: res.status, code: data?.code ?? null });
        setError(t("auth_consent_save_failed"));
        return;
      }

      invalidateMeProfileDedupedCache();
      try {
        const { status, json } = await fetchMeProfileDeduped();
        const raw = json as { ok?: boolean; profile?: ProfileRow } | null;
        if (status === 200 && raw?.ok && raw.profile?.id) {
          mergeAppBootProfileFull(raw.profile);
          const fromDb = profileRowToClientProfile(raw.profile);
          const prev = getCurrentUser();
          setSupabaseProfileCache({
            ...(prev ?? fromDb),
            ...fromDb,
            avatar_url: fromDb.avatar_url ?? prev?.avatar_url ?? null,
            temperature: fromDb.temperature ?? prev?.temperature ?? 50,
          });
        }
      } catch {
        /* 캐시 갱신 실패는 signup-status 로 위임 */
      }

      markSignupConsentResolvedSession();
      notifyLegalConsentCompleted();

      // In-session reconsent / age check returns to the exact origin screen (deep links included);
      // first signup keeps the fresh-login landing route.
      let target = next;
      if (!priorConsent) {
        const { status: signupStatus, json: signupJson } = await fetchSignupStatusDeduped(next);
        if (signupStatus === 200 && signupJson?.route?.trim()) target = signupJson.route.trim();
      }

      guardedRouterReplace(router, target, {
        source: "auth-consent-form",
        reason: "consent_saved",
      });
    } catch {
      const nextError = t("auth_consent_save_failed");
      setError((prev) => (prev === nextError ? prev : nextError));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const title = ageOnly
    ? safeT("auth_consent_age_title", { fallbackKo: "연령 확인", fallbackEn: "Age verification" })
    : isReconsent
      ? safeT("auth_consent_reconsent_title", { fallbackKo: "약관 재동의", fallbackEn: "Review updated terms" })
      : t("auth_consent_title");

  const description = ageOnly
    ? safeT("auth_consent_age_intro", {
        fallbackKo: "서비스 이용을 위해 만 14세 이상임을 생년월일로 확인해 주세요.",
        fallbackEn: "Confirm you are 14 or older with your date of birth to continue.",
      })
    : isReconsent
      ? safeT("auth_consent_reconsent_intro", {
          fallbackKo:
            "이용약관 또는 개인정보처리방침이 개정되어 동의가 필요합니다. 필수 항목에 동의하면 서비스를 계속 이용할 수 있습니다.",
          fallbackEn:
            "Terms or Privacy Policy were updated. Agree to the required items to keep using the service.",
        })
      : safeT("auth_consent_intro_v2", {
          fallbackKo:
            "서비스 이용을 위해 아래 항목에 동의해 주세요. 선택 항목은 동의하지 않아도 가입할 수 있습니다.",
          fallbackEn: "Please agree to the items below. Optional items are not required to join.",
        });

  const showAllToggle = [needsLegal, needsAge, Boolean(marketing)].filter(Boolean).length > 1;

  return (
    <>
      <DibayOnboardingOverlayShell
        title={title}
        description={description}
        titleId="dibay-onboarding-consent-title"
        descriptionId="dibay-onboarding-consent-desc"
      >
        {isReconsent && shownVersions ? (
          <div className={`mb-3 ${DIBAY_ONBOARDING_NOTICE_CLASS}`}>
            {safeT("auth_consent_required_versions", {
              fallbackKo: `필수 버전: 이용약관 ${shownVersions.termsVersion} · 개인정보 ${shownVersions.privacyVersion}`,
              fallbackEn: `Required: Terms ${shownVersions.termsVersion} · Privacy ${shownVersions.privacyVersion}`,
              vars: { terms: shownVersions.termsVersion, privacy: shownVersions.privacyVersion },
            })}
          </div>
        ) : null}

        {showAllToggle ? (
          <div className={DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS}>
            <label className="flex min-h-[44px] items-start gap-3">
              <input
                type="checkbox"
                checked={agreeAll}
                onChange={(e) => onToggleAll(e.target.checked)}
                className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
              />
              <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
                <span className="font-semibold">{t("auth_consent_all_label")}</span>
                <span className="mt-0.5 block text-[12px] text-sam-muted">{t("auth_consent_all_hint")}</span>
              </span>
            </label>
          </div>
        ) : null}

        <p className="mb-2 mt-4 text-[12px] font-bold text-sam-muted">{t("auth_consent_section_required")}</p>
        <div className={DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS}>
          {needsLegal ? (
            <>
              <label className="flex min-h-[44px] items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreeTerms(v);
                    syncAllFromParts(v, agreePrivacy, attestAge, agreeMarketing);
                  }}
                  className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
                />
                <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
                  {tagReq}
                  {t("auth_consent_terms_label")}{" "}
                  <button type="button" className={DIBAY_ONBOARDING_LINK_CLASS} onClick={() => setSheetKind("terms")}>
                    {t("auth_consent_terms_link")}
                  </button>
                </span>
              </label>
              <label className="flex min-h-[44px] items-start gap-3">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreePrivacy(v);
                    syncAllFromParts(agreeTerms, v, attestAge, agreeMarketing);
                  }}
                  className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
                />
                <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
                  {tagReq}
                  {t("auth_consent_privacy_collect_label")}{" "}
                  <button type="button" className={DIBAY_ONBOARDING_LINK_CLASS} onClick={() => setSheetKind("privacy")}>
                    {t("auth_consent_privacy_link")}
                  </button>
                  <span className="mt-0.5 block text-[12px] text-sam-muted">{t("auth_consent_privacy_collect_hint")}</span>
                </span>
              </label>
            </>
          ) : null}

          {needsAge ? (
            <>
              <label className="flex min-h-[44px] items-start gap-3">
                <input
                  type="checkbox"
                  checked={attestAge}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAttestAge(v);
                    syncAllFromParts(agreeTerms, agreePrivacy, v, agreeMarketing);
                  }}
                  className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
                />
                <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
                  {tagReq}
                  {safeT("auth_consent_age_label", {
                    fallbackKo: "만 14세 이상입니다",
                    fallbackEn: "I am 14 years of age or older",
                  })}
                  <span className="mt-0.5 block text-[12px] text-sam-muted">
                    {safeT("auth_consent_age_hint", {
                      fallbackKo: "자기신고 · 신원 인증이 아닙니다",
                      fallbackEn: "Self-declaration · not identity verification",
                    })}
                  </span>
                </span>
              </label>

              <label className="mt-2 block space-y-1">
                <span className="text-[12px] font-bold text-sam-muted">
                  {safeT("auth_consent_dob_label", { fallbackKo: "생년월일", fallbackEn: "Date of birth" })}
                </span>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="min-h-[44px] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[15px] text-sam-fg"
                  max={new Date().toISOString().slice(0, 10)}
                  data-testid="auth-consent-dob"
                />
              </label>
            </>
          ) : null}
        </div>

        {marketing ? (
          <>
            <p className="mb-2 mt-4 text-[12px] font-bold text-sam-muted">{t("auth_consent_section_optional")}</p>
            <div className={DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS}>
              <label className="flex min-h-[44px] items-start gap-3" data-auth-consent-marketing>
                <input
                  type="checkbox"
                  checked={agreeMarketing}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAgreeMarketing(v);
                    syncAllFromParts(agreeTerms, agreePrivacy, attestAge, v);
                  }}
                  className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
                />
                <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
                  {tagOpt}
                  {language === "en" ? marketing.title.en : marketing.title.ko}{" "}
                  <button
                    type="button"
                    className={DIBAY_ONBOARDING_LINK_CLASS}
                    onClick={() => setSheetKind("marketing")}
                  >
                    {t("auth_consent_marketing_link")}
                  </button>
                </span>
              </label>
            </div>
            <div className={`mt-4 ${DIBAY_ONBOARDING_NOTICE_CLASS}`}>{t("auth_consent_feature_notice")}</div>
          </>
        ) : null}

        <div className={`mt-3 ${DIBAY_ONBOARDING_NOTICE_CLASS}`}>{t("auth_consent_safety_notice")}</div>

        {error ? (
          <p className={`mt-4 ${DIBAY_ONBOARDING_ERROR_CLASS}`} role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || !requiredOk}
          className={`mt-5 ${DIBAY_ONBOARDING_PRIMARY_BTN}`}
        >
          {submitting ? t("auth_consent_submitting") : t("auth_consent_submit")}
        </button>

        <div className="mt-5 border-t border-sam-border pt-4" data-auth-consent-escape>
          <p className="text-[12px] text-sam-muted">{t("auth_consent_escape_hint")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href={CUSTOMER_CENTER_HREF}
              className={`inline-flex min-h-[44px] items-center ${DIBAY_ONBOARDING_LINK_CLASS}`}
            >
              {t("auth_consent_escape_support")}
            </Link>
            <Link
              href={MYPAGE_HOME_ACCOUNT_LEAVE_HREF}
              className={`inline-flex min-h-[44px] items-center ${DIBAY_ONBOARDING_LINK_CLASS}`}
            >
              {t("auth_consent_escape_leave")}
            </Link>
            <span className="inline-flex min-h-[44px] items-center">
              <LogoutActionTrigger variant="text_link" />
            </span>
          </div>
        </div>
      </DibayOnboardingOverlayShell>

      <ConsentLegalDocSheet open={sheetKind != null} kind={sheetKind} onClose={() => setSheetKind(null)} />
    </>
  );
}
