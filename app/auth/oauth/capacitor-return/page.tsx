"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildValidatedNativeAppCallbackUrl } from "@/lib/auth/oauth/native-oauth-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";

/** 자동 이동이 없을 때 수동 복귀 버튼을 보여 주기까지 대기 (P2-15 UX: 빈 화면 방지) */
const CAPACITOR_RETURN_FALLBACK_DELAY_MS = 2_000;

/**
 * Custom Tab OAuth bridge — Supabase redirects here (https), then JS opens dibay:// for the app.
 * 약 2초 안에 앱으로 넘어가지 않으면 "앱으로 돌아가기" 버튼을 보여 준다
 * (검증된 dibay:// 콜백이 있으면 그 링크, 없으면 /login).
 */
export default function OAuthCapacitorReturnPage() {
  const { safeT } = useI18n();
  const bridgedRef = useRef(false);
  const [fallbackHref, setFallbackHref] = useState<string | null>(null);

  useEffect(() => {
    if (bridgedRef.current) return;
    bridgedRef.current = true;

    const search = window.location.search;
    const hash = window.location.hash;
    const target = buildValidatedNativeAppCallbackUrl(search, hash);
    const fallbackTimer = window.setTimeout(() => {
      setFallbackHref(target ?? "/login");
    }, CAPACITOR_RETURN_FALLBACK_DELAY_MS);

    if (!target) {
      logOAuthNativeEvent("capacitor_return_bridge_skipped", {
        hasSearch: Boolean(search),
        hasHash: Boolean(hash),
        reason: "missing_code_or_error",
      });
      return () => window.clearTimeout(fallbackTimer);
    }

    logOAuthNativeEvent("capacitor_return_bridge", {
      hasSearch: Boolean(search),
      hasHash: Boolean(hash),
      targetPrefix: target.slice(0, 56),
    });
    window.location.replace(target);
    return () => window.clearTimeout(fallbackTimer);
  }, []);

  if (!fallbackHref) return null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-sam-app px-6 text-center">
      <p className="sam-text-body-secondary text-sam-muted">
        {safeT("auth_oauth_return_to_app_hint", {
          fallbackKo: "앱이 자동으로 열리지 않으면 아래 버튼을 눌러 주세요.",
          fallbackEn: "If the app does not open automatically, tap the button below.",
        })}
      </p>
      <a
        href={fallbackHref}
        className="inline-flex min-h-[48px] w-full max-w-xs items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[15px] font-semibold text-sam-on-primary"
        data-testid="capacitor-return-fallback"
      >
        {safeT("auth_oauth_return_to_app", { fallbackKo: "앱으로 돌아가기", fallbackEn: "Return to the app" })}
      </a>
    </main>
  );
}
