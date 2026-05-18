"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getAppSettings } from "@/lib/app-settings";
import {
  mannerBatteryAccentClass,
  mannerBatteryTier,
  mannerRawToPercent,
} from "@/lib/trust/manner-battery";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";

export default function MyTrustPage() {
  const { t } = useI18n();
  const [temp, setTemp] = useState<number | null>(() => {
    const u = getHydrationSafeCurrentUser();
    return u?.temperature ?? null;
  });

  useEffect(() => {
    const sync = () => {
      const u = getCurrentUser();
      setTemp(u?.temperature ?? null);
    };
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  const mannerPercent = temp != null ? mannerRawToPercent(temp) : null;
  const mannerTier = mannerPercent != null ? mannerBatteryTier(mannerPercent) : null;
  const batteryLabel = getAppSettings().speedDisplayLabel ?? t("mypage_trust_title");

  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_trust_title")}
        subtitle={t("mypage_trust_subtitle")}
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-6 text-center shadow-sm">
          <p className="sam-text-body-secondary text-sam-muted">
            {batteryLabel} {t("mypage_trust_battery_label_suffix")}
          </p>
          {mannerPercent != null && mannerTier != null ? (
            <>
              <div className="mt-3 flex justify-center">
                <MannerBatteryIcon tier={mannerTier} percent={mannerPercent} size="lg" />
              </div>
              <p
                className={`mt-2 sam-text-hero font-bold tabular-nums ${mannerBatteryAccentClass(
                  mannerTier,
                )}`}
              >
                {mannerPercent}%
              </p>
            </>
          ) : (
            <p className="mt-2 sam-text-hero font-bold text-sam-meta">—</p>
          )}
          <p className="mt-4 sam-text-body-secondary leading-relaxed text-sam-muted">
            {t("mypage_trust_battery_hint_before")}{" "}
            <strong className="text-sam-fg">{t("mypage_trust_battery_hint_days")}</strong>
            {t("mypage_trust_battery_hint_after")}
          </p>
        </div>
        <Link
          href={MYPAGE_PROFILE_EDIT_HREF}
          className="mt-6 block text-center sam-text-body font-medium text-signature underline-offset-2 hover:underline"
        >
          {t("mypage_trust_profile_edit_link")}
        </Link>
      </div>
    </div>
  );
}
