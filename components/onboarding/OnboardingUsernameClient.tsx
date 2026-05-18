"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { Sam } from "@/lib/ui/sam-component-classes";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";

type ReserveResp =
  | { ok: true; available: boolean; normalized: string }
  | { ok: false; error: string };

type ConfirmResp =
  | { ok: true; username: string }
  | { ok: false; error: string };

function normalizeUsernameInput(v: string): string {
  return String(v ?? "").trim().toLowerCase().replace(/^@+/, "");
}

export function OnboardingUsernameClient() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(() => sanitizeNextPath(searchParams?.get("next") ?? null), [searchParams]);
  const target = next ?? POST_LOGIN_PATH;

  const [raw, setRaw] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const normalized = useMemo(() => normalizeUsernameInput(raw), [raw]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => router.replace(target), 600);
    return () => window.clearTimeout(timer);
  }, [done, router, target]);

  const reserve = async () => {
    if (!normalized) return;
    setChecking(true);
    setError(null);
    setAvailable(null);
    try {
      const res = await fetch("/api/me/username/reserve", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: normalized }),
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
    if (submitting || done) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/username/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });
      const json = (await res.json().catch(() => null)) as ConfirmResp | null;
      if (!res.ok || !json || json.ok !== true) {
        setError((json as { error?: string } | null)?.error || t("auth_onboarding_save_failed"));
        return;
      }
      try {
        invalidateMeProfileDedupedCache();
      } catch {
        /* ignore */
      }
      setDone(true);
    } catch {
      setError(t("auth_onboarding_save_network"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingShell
      title={t("auth_onboarding_username_title")}
      description={t("auth_onboarding_username_desc")}
    >
      <form onSubmit={confirm} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="sam-text-helper text-sam-muted">{t("auth_onboarding_username_label")}</span>
          <div className="flex items-center gap-2">
            <span className="sam-text-body text-sam-muted">@</span>
            <input
              type="text"
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setAvailable(null);
                setError(null);
              }}
              maxLength={24}
              disabled={checking || submitting || done}
              className={`${Sam.input.base} flex-1`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="boss_market"
              autoFocus
            />
            <button
              type="button"
              onClick={() => void reserve()}
              disabled={checking || submitting || done || !normalized}
              className={`${Sam.btn.secondary} shrink-0 disabled:opacity-50`}
            >
              {checking ? t("auth_onboarding_username_checking") : t("auth_onboarding_username_check")}
            </button>
          </div>
        </label>

        {available === true && !error ? (
          <p role="status" className="sam-text-body-secondary text-sam-success">
            {t("auth_onboarding_username_available")}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="sam-text-body-secondary text-red-600">
            {error}
          </p>
        ) : null}

        {done ? (
          <p role="status" className="sam-text-body-secondary text-sam-success">
            {t("auth_onboarding_saved_redirect")}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || done || available !== true}
          className={`${Sam.btn.primary} mt-2 w-full disabled:opacity-50`}
        >
          {submitting
            ? t("auth_consent_submitting")
            : done
              ? t("auth_status_navigating")
              : t("auth_onboarding_confirm")}
        </button>
      </form>
    </OnboardingShell>
  );
}
