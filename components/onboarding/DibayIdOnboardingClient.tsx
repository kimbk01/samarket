"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOnboardingOverlayShell } from "@/components/auth/DibayOnboardingOverlayShell";
import { normalizeDibayIdInput } from "@/lib/auth/dibay-id-policy";
import { resolveDibaySignupRoute } from "@/lib/auth/dibay-signup-status";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { markSignupCompleteResolvedSession } from "@/lib/auth/signup-gate-session";
import { fetchSignupStatusDeduped } from "@/lib/auth/fetch-signup-status-client";
import { invalidateMeProfileDedupedCache, fetchMeProfileDeduped } from "@/lib/profile/fetch-me-profile-deduped";
import { mergeAppBootProfileFull } from "@/lib/app-boot/app-boot-store";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { ProfileRow } from "@/lib/profile/types";
import { guardedRouterReplace } from "@/lib/dev/network-loop-guard";
import { markCallMediaOnboardingPendingSource } from "@/lib/permissions/dibay-device-permission-onboarding";
import {
  DIBAY_ONBOARDING_CONSENT_DONE_CLASS,
  DIBAY_ONBOARDING_INPUT_CLASS,
  DIBAY_ONBOARDING_PRIMARY_BTN,
  DIBAY_ONBOARDING_SECONDARY_BTN,
} from "@/lib/ui/dibay-onboarding-starbucks-styles";

type ReserveResp =
  | { ok: true; available: boolean; normalized: string }
  | { ok: false; error: string };

type ConfirmResp =
  | { ok: true; dibay_id: string; idempotent?: boolean }
  | { ok: false; error: string };

export function DibayIdOnboardingClient() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(() => sanitizeNextPath(searchParams?.get("next") ?? null), [searchParams]);
  const fallbackTarget = next ?? POST_LOGIN_PATH;

  const [raw, setRaw] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const normalized = useMemo(() => normalizeDibayIdInput(raw), [raw]);

  const navigateAfterComplete = async () => {
    markCallMediaOnboardingPendingSource("signup_complete");
    const { status, json } = await fetchSignupStatusDeduped();
    const route =
      status === 200 && json?.route?.trim()
        ? json.route.trim()
        : fallbackTarget;
    guardedRouterReplace(router, route, {
      source: "dibay-id-onboarding",
      reason: "signup_complete",
    });
  };

  const reserve = async () => {
    if (!normalized) return;
    setChecking(true);
    setError(null);
    setAvailable(null);
    try {
      const res = await fetch("/api/me/dibay-id/reserve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dibay_id: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ReserveResp | null;
      if (!res.ok || !json || json.ok !== true) {
        setError((json as { error?: string } | null)?.error || t("auth_onboarding_username_check_failed"));
        return;
      }
      setAvailable(json.available);
      if (!json.available) {
        setError(t("auth_onboarding_username_taken"));
      }
    } catch {
      setError(t("auth_onboarding_username_check_network"));
    } finally {
      setChecking(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || submitting) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/dibay-id/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dibay_id: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ConfirmResp | null;
      if (!res.ok || !json || json.ok !== true) {
        const code = (json as { error?: string } | null)?.error ?? "";
        if (code === "terms_required") {
          setError(t("auth_consent_both_required"));
        } else if (code === "dibay_id_taken") {
          setError(t("auth_onboarding_username_taken"));
        } else {
          setError(code || t("auth_onboarding_save_failed"));
        }
        return;
      }
      markSignupCompleteResolvedSession();
      try {
        invalidateMeProfileDedupedCache();
        const { status, json: profileJson } = await fetchMeProfileDeduped();
        const rawProfile = profileJson as { ok?: boolean; profile?: ProfileRow } | null;
        if (status === 200 && rawProfile?.ok && rawProfile.profile?.id) {
          mergeAppBootProfileFull(rawProfile.profile);
          const fromDb = profileRowToClientProfile(rawProfile.profile);
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
      await navigateAfterComplete();
    } catch {
      setError(t("auth_onboarding_save_network"));
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const { status, json } = await fetchSignupStatusDeduped();
      if (status !== 200 || !json?.signup) return;
      if (!json.signup.consentComplete) {
        guardedRouterReplace(router, resolveDibaySignupRoute(json.signup, next), {
          source: "dibay-id-onboarding",
          reason: "terms_required",
        });
        return;
      }
      if (json.signup.signupComplete) {
        await navigateAfterComplete();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount guard only
  }, []);

  const confirmDisabled = submitting || available !== true;

  return (
    <DibayOnboardingOverlayShell
      step={2}
      title={t("auth_onboarding_username_title")}
      description={t("auth_onboarding_username_desc")}
      titleId="dibay-onboarding-id-title"
      descriptionId="dibay-onboarding-id-desc"
      headerExtra={
        <div className={DIBAY_ONBOARDING_CONSENT_DONE_CLASS}>
          <Check className="h-4 w-4 shrink-0" aria-hidden />
          <span>{t("auth_consent_title")}</span>
        </div>
      }
    >
      <form onSubmit={(e) => void confirm(e)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-[#6F4E37]">{t("auth_onboarding_username_label")}</span>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-[#6F4E37]">@</span>
            <input
              type="text"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setAvailable(null);
                setError(null);
              }}
              maxLength={24}
              disabled={checking || submitting}
              className={DIBAY_ONBOARDING_INPUT_CLASS}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="boss_market"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void reserve()}
              disabled={checking || submitting || !normalized}
              className={DIBAY_ONBOARDING_SECONDARY_BTN}
            >
              {checking ? t("auth_onboarding_username_checking") : t("auth_onboarding_username_check")}
            </button>
          </div>
        </label>

        {available === true && !error ? (
          <p role="status" className="text-[13px] font-medium text-[#00704A]">
            {t("auth_onboarding_username_available")}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-[#C0392B]">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={confirmDisabled}
          className={`mt-2 ${DIBAY_ONBOARDING_PRIMARY_BTN}`}
        >
          {submitting ? t("auth_consent_submitting") : t("auth_onboarding_confirm")}
        </button>
      </form>
    </DibayOnboardingOverlayShell>
  );
}
