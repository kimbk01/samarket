"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { getCurrentUser, getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getAppSettings } from "@/lib/app-settings";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";
import {
  buildMemberTrustSurface,
  type MemberTrustSurface,
} from "@/lib/trust/member-trust-surface";

function surfaceFromSession(): MemberTrustSurface {
  const u = getCurrentUser() ?? getHydrationSafeCurrentUser();
  return buildMemberTrustSurface({
    trust_score: u?.trust_score,
    temperature: u?.temperature,
  });
}

export default function MyTrustPage() {
  const { t, safeT } = useI18n();
  const [surface, setSurface] = useState<MemberTrustSurface>(() => surfaceFromSession());
  const authorityFromApiRef = useRef(false);

  useEffect(() => {
    const syncFromSession = () => {
      // CONTRACT (Slice 4): session temperature must not clobber DB-backed API authority.
      if (authorityFromApiRef.current) return;
      setSurface(surfaceFromSession());
    };
    syncFromSession();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, syncFromSession);

    let cancelled = false;
    void (async () => {
      try {
        // Slice 1/4: bypass route memory cache so Member matches Admin Facts.
        const res = await fetch("/api/me/profile?fresh=1", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          profile?: {
            trust_score?: number | null;
            manner_score?: number | null;
            temperature?: number | null;
          };
          trust_score?: number | null;
          manner_score?: number | null;
          temperature?: number | null;
        };
        const row = data.profile ?? data;
        if (cancelled) return;
        authorityFromApiRef.current = true;
        setSurface(
          buildMemberTrustSurface({
            trust_score: row.trust_score,
            manner_score: row.manner_score,
            temperature: row.temperature,
          }),
        );
      } catch {
        /* session projection already set */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, syncFromSession);
    };
  }, []);

  const batteryLabel = getAppSettings().speedDisplayLabel ?? t("mypage_trust_title");
  // CONTRACT (Slice 4): display from profiles.trust_score; home manner row uses same buildMemberTrustSurface.

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
          <div className="mt-3 flex justify-center">
            <MannerBatteryIcon
              tier={surface.tier}
              percent={surface.percent}
              size="lg"
            />
          </div>
          <p
            className={`mt-2 sam-text-hero font-bold tabular-nums ${surface.accentClass}`}
            data-testid="mypage-trust-percent"
          >
            {surface.percentLabel}
          </p>
          <p
            className="mt-1 text-[15px] font-semibold tabular-nums text-sam-fg"
            data-testid="mypage-trust-score"
          >
            {safeT("mypage_trust_score_label", {
              fallbackKo: "신뢰 점수",
              fallbackEn: "Trust score",
            })}{" "}
            <span className={surface.accentClass}>{surface.scoreLabel}</span>
          </p>
          <p className="mt-4 sam-text-body-secondary leading-relaxed text-sam-muted">
            {t("mypage_trust_battery_hint_before")}{" "}
            <strong className="text-sam-fg">{t("mypage_trust_battery_hint_days")}</strong>
            {t("mypage_trust_battery_hint_after")}
          </p>
        </div>
        <Link
          href={MYPAGE_PROFILE_EDIT_HREF}
          className="mt-6 flex min-h-[44px] items-center justify-center text-center sam-text-body font-medium text-sam-primary underline-offset-2 hover:underline"
        >
          {t("mypage_trust_profile_edit_link")}
        </Link>
      </div>
    </div>
  );
}
