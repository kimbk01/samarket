"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 로그인 직후 닉네임/필수 프로필이 비어있으면 도착하는 화면 (스펙 1-B, 8).
 */
export function OnboardingProfileClient({ initialNickname }: { initialNickname: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () => sanitizeNextPath(searchParams?.get("next") ?? null),
    [searchParams]
  );
  const target = next ?? POST_LOGIN_PATH;

  const [displayName, setDisplayName] = useState(initialNickname.trim());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (initialNickname.trim().length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/profile", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { profile?: { display_name?: string | null; nickname?: string | null } } | null;
        const seed = (json?.profile?.display_name ?? json?.profile?.nickname ?? "").trim();
        if (!cancelled && seed.length > 0) {
          setDisplayName(seed);
        }
      } catch {
        /* 초기 닉네임 가져오기는 실패해도 폼은 동작 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialNickname]);

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => router.replace(target), 600);
    return () => window.clearTimeout(timer);
  }, [done, router, target]);

  const trimmed = displayName.trim();
  const isInvalid = trimmed.length < 2 || trimmed.length > 20;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || done) return;
    if (isInvalid) {
      setError(t("auth_onboarding_nickname_invalid"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || json?.ok === false) {
        setError(json?.error || t("auth_onboarding_save_retry"));
        return;
      }
      try {
        invalidateMeProfileDedupedCache();
      } catch {
        /* 캐시 무효화 실패는 흐름을 막지 않는다. */
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
      title={t("auth_onboarding_profile_title")}
      description={t("auth_onboarding_profile_desc")}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="sam-text-helper text-sam-muted">{t("auth_onboarding_nickname_label")}</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={20}
            disabled={submitting || done}
            className={Sam.input.base}
            autoFocus
          />
        </label>
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
          disabled={submitting || done || isInvalid}
          className={`${Sam.btn.primary} mt-2 w-full disabled:opacity-50`}
        >
          {submitting
            ? t("auth_consent_submitting")
            : done
              ? t("auth_status_navigating")
              : t("auth_onboarding_next")}
        </button>
      </form>
    </OnboardingShell>
  );
}
