"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { invalidateMeProfileDedupedCache, fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ProfileRow } from "@/lib/profile/types";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { markSignupConsentResolvedSession } from "@/lib/auth/signup-gate-session";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";

export function AuthConsentForm() {
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
        body: JSON.stringify({ agreeTerms: true, agreePrivacy: true }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error || t("auth_consent_save_failed"));
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

      const { status: signupStatus, json: signupJson } = await fetchSignupStatusDeduped();
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
    <div className="mx-auto w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-sam-fg">{t("auth_consent_title")}</h1>
      <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
        {t("auth_consent_intro")}
      </p>

      <div className="mt-5 space-y-3 rounded-ui-rect border border-sam-border bg-sam-app/60 p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mt-1" />
          <span className="sam-text-body text-sam-fg">
            {t("auth_consent_terms_label")}{" "}
            <Link href="/terms" target="_blank" className="text-signature underline">
              {t("auth_consent_terms_link")}
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="mt-1" />
          <span className="sam-text-body text-sam-fg">
            {t("auth_consent_privacy_label")}{" "}
            <Link href="/privacy" target="_blank" className="text-signature underline">
              {t("auth_consent_privacy_link")}
            </Link>
          </span>
        </label>
      </div>

      <div className="mt-5 rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-sam-fg">
        {t("auth_consent_safety_notice")}
      </div>

      {error ? <p className="mt-4 sam-text-body-secondary text-red-600">{error}</p> : null}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="mt-5 w-full rounded-ui-rect bg-signature py-3 sam-text-body font-semibold text-white disabled:opacity-50"
      >
        {submitting ? t("auth_consent_submitting") : t("auth_consent_submit")}
      </button>
    </div>
  );
}
