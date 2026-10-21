"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOnboardingOverlayShell } from "@/components/auth/DibayOnboardingOverlayShell";
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
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import {
  DIBAY_ONBOARDING_CHECKBOX_CLASS,
  DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS,
  DIBAY_ONBOARDING_ERROR_CLASS,
  DIBAY_ONBOARDING_LABEL_CLASS,
  DIBAY_ONBOARDING_LINK_CLASS,
  DIBAY_ONBOARDING_NOTICE_CLASS,
  DIBAY_ONBOARDING_PRIMARY_BTN,
} from "@/lib/ui/dibay-onboarding-starbucks-styles";

export function AuthConsentForm({
  requiredVersions,
}: {
  /** Versions the server required when this screen rendered — sent back so a stale screen cannot record a newer version (P7). */
  requiredVersions?: { termsVersion: string; privacyVersion: string } | null;
} = {}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawNext = searchParams.get("next")?.trim() || POST_LOGIN_PATH;
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : POST_LOGIN_PATH;
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [shownVersions, setShownVersions] = useState(requiredVersions ?? null);

  const handleSubmit = async () => {
    if (inFlightRef.current || submitting) return;
    if (!agreeTerms || !agreePrivacy) {
      const nextError = t("auth_consent_both_required");
      setError((prev) => (prev === nextError ? prev : nextError));
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
          agreeTerms: true,
          agreePrivacy: true,
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
        setAgreeTerms(false);
        setAgreePrivacy(false);
        setError(t("auth_consent_version_stale"));
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

      const { status: signupStatus, json: signupJson } = await fetchSignupStatusDeduped(next);
      const target =
        signupStatus === 200 && signupJson?.route?.trim()
          ? signupJson.route.trim()
          : next;

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

  return (
    <DibayOnboardingOverlayShell
      title={t("auth_consent_title")}
      description={t("auth_consent_intro")}
      titleId="dibay-onboarding-consent-title"
      descriptionId="dibay-onboarding-consent-desc"
    >
      <div className={DIBAY_ONBOARDING_CHECKBOX_PANEL_CLASS}>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
          />
          <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
            {t("auth_consent_terms_label")}{" "}
            <Link href="/terms" target="_blank" className={DIBAY_ONBOARDING_LINK_CLASS}>
              {t("auth_consent_terms_link")}
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={agreePrivacy}
            onChange={(e) => setAgreePrivacy(e.target.checked)}
            className={DIBAY_ONBOARDING_CHECKBOX_CLASS}
          />
          <span className={DIBAY_ONBOARDING_LABEL_CLASS}>
            {t("auth_consent_privacy_label")}{" "}
            <Link href="/privacy" target="_blank" className={DIBAY_ONBOARDING_LINK_CLASS}>
              {t("auth_consent_privacy_link")}
            </Link>
          </span>
        </label>
      </div>

      <div className={`mt-4 ${DIBAY_ONBOARDING_NOTICE_CLASS}`}>{t("auth_consent_safety_notice")}</div>

      {error ? <p className={`mt-4 ${DIBAY_ONBOARDING_ERROR_CLASS}`} role="alert">{error}</p> : null}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !agreeTerms || !agreePrivacy}
        className={`mt-5 ${DIBAY_ONBOARDING_PRIMARY_BTN}`}
      >
        {submitting ? t("auth_consent_submitting") : t("auth_consent_submit")}
      </button>
    </DibayOnboardingOverlayShell>
  );
}
