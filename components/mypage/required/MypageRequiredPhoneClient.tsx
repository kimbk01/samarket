"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { refreshClientMemberAccountAfterMutation } from "@/lib/auth/sync-member-account-client";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

export function MypageRequiredPhoneClient() {
  const router = useRouter();
  const { t } = useI18n();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [phoneSettings, setPhoneSettings] = useState<{
    enabled: boolean;
    provider: "supabase" | "semaphore";
    guide_text: string;
    resend_cooldown_seconds: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, settingsRes] = await Promise.all([
      getMyProfile(),
      runSingleFlight("me:phone-verification:get", () =>
        fetch("/api/me/phone-verification", { credentials: "include", cache: "no-store" }),
      ),
    ]);
    setProfile(p);
    try {
      const j = (await settingsRes.json()) as {
        ok?: boolean;
        verification?: {
          settings?: {
            enabled?: boolean;
            provider?: string;
            guide_text?: string;
            resend_cooldown_seconds?: number;
          };
        };
      };
      const s = j?.verification?.settings;
      if (j?.ok && s) {
        setPhoneSettings({
          enabled: s.enabled === true,
          provider: (s.provider === "semaphore" ? "semaphore" : "supabase") as "supabase" | "semaphore",
          guide_text: s.guide_text ?? "",
          resend_cooldown_seconds: Number(s.resend_cooldown_seconds ?? 60),
        });
      } else {
        setPhoneSettings(null);
      }
    } catch {
      setPhoneSettings(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const snapshot = useMemo(() => {
    if (!profile) return null;
    return {
      phone: profile.phone ?? null,
      phone_country_code: profile.phone_country_code ?? null,
      phone_number: profile.phone_number ?? null,
      phone_verified: profile.phone_verified === true,
      phone_verified_at: profile.phone_verified_at ?? null,
      phone_verification_method: profile.phone_verification_method ?? null,
      phone_verification_status: profile.phone_verification_status ?? null,
      member_status: profile.member_status ?? null,
      role: profile.role ?? null,
      privilegedAdmin: profile.privilegedAdmin === true,
      email: profile.auth_login_email ?? profile.email ?? null,
      provider: profile.provider ?? profile.auth_provider ?? null,
      auth_provider: profile.auth_provider ?? profile.provider ?? null,
      settings: phoneSettings ?? undefined,
    };
  }, [profile, phoneSettings]);

  const handleRefresh = useCallback(async () => {
    const fresh = await refreshClientMemberAccountAfterMutation();
    await load();
    if (fresh && hasVerifiedPhone(fresh)) {
      const raw =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("returnTo")
          : null;
      router.replace(sanitizeNextPath(raw) || MYPAGE_MAIN_HREF);
    }
  }, [load, router]);

  if (loading || !snapshot) {
    return <p className="py-10 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  if (phoneSettings && !phoneSettings.enabled) {
    return (
      <p className="px-4 py-6 sam-text-body text-sam-muted">
        {t("mypage_comp_phone_verify_disabled")}
      </p>
    );
  }

  return (
    <div className="px-4 py-4 sm:px-5">
      <PhoneVerificationBox snapshot={snapshot} onRefreshProfile={handleRefresh} />
    </div>
  );
}
