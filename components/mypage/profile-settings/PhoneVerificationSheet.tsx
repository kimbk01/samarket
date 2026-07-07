"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import type { ProfileRow } from "@/lib/profile/types";
import { PhoneVerificationBox } from "@/components/mypage/profile/PhoneVerificationBox";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { invalidateMeProfileDedupedCache } from "@/lib/profile/fetch-me-profile-deduped";
import { invalidateMandatoryAddressGateClientCache } from "@/lib/addresses/mandatory-address-gate-client";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { MypageBottomSheetShell } from "./MypageBottomSheetShell";
import { useMypageProfileSheets } from "./mypage-profile-sheets-context";

export function PhoneVerificationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { onProfileUpdated } = useMypageProfileSheets();
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
    if (!open) return;
    void load();
  }, [open, load]);

  const snapshot = useMemo(() => {
    if (!profile) return null;
    return {
      phone: profile.phone ?? null,
      phone_country_code: profile.phone_country_code ?? null,
      phone_number: profile.phone_number ?? null,
      phone_verified: profile.phone_verified === true,
      phone_verified_at: profile.phone_verified_at ?? null,
      phone_verification_status: profile.phone_verification_status ?? null,
      member_status: profile.member_status ?? null,
      role: profile.role ?? null,
      email: profile.auth_login_email ?? profile.email ?? null,
      provider: profile.provider ?? profile.auth_provider ?? null,
      auth_provider: profile.auth_provider ?? profile.provider ?? null,
      settings: phoneSettings ?? undefined,
    };
  }, [profile, phoneSettings]);

  const handleRefresh = useCallback(async () => {
    invalidateMeProfileDedupedCache();
    invalidateMandatoryAddressGateClientCache();
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
      }
    } catch {
      /* keep prior settings */
    }
    onProfileUpdated();
    if (p && hasVerifiedPhone(p)) {
      onClose();
    }
  }, [onClose, onProfileUpdated]);

  return (
    <MypageBottomSheetShell
      open={open}
      onClose={onClose}
      title={t("mypage_settings_phone")}
    >
      {loading || !snapshot ? (
        <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : phoneSettings && !phoneSettings.enabled ? (
        <p className="py-4 sam-text-body text-sam-muted">
          {t("mypage_comp_phone_verify_disabled")}
        </p>
      ) : (
        <PhoneVerificationBox snapshot={snapshot} onRefreshProfile={handleRefresh} />
      )}
    </MypageBottomSheetShell>
  );
}
