"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayAuthLogo } from "@/components/auth/DibayAuthLogo";
import {
  getOAuthLoginContinueLabelKey,
  getOAuthLoginPrimaryStyle,
  OAUTH_LOGIN_PRIMARY_BUTTON_BASE,
  OAuthLoginProviderIcon,
} from "@/components/auth/OAuthLoginProviderVisuals";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { openNativeOAuthBrowser } from "@/lib/auth/oauth/open-native-oauth-browser";

type Props = {
  authorizeUrl: string;
  provider: OAuthProvider;
};

export function NativeOAuthLaunchClient({ authorizeUrl, provider }: Props) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const style = getOAuthLoginPrimaryStyle(provider);

  const handleOpen = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      await openNativeOAuthBrowser(authorizeUrl);
    } catch {
      setError(t("auth_err_oauth_browser_open_failed"));
    } finally {
      setOpening(false);
    }
  }, [authorizeUrl, opening, t]);

  const buttonClassName = style?.buttonClassName ?? "border border-sam-border bg-sam-surface";
  const labelClassName = style?.labelClassName ?? "text-sam-fg";

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-sam-app px-6">
      <DibayAuthLogo size={56} />
      <p className="mt-4 text-center text-base font-medium text-sam-fg">
        {error ?? t("auth_oauth_launch_tap_title")}
      </p>
      <p className="mt-2 text-center sam-text-body-secondary text-sam-muted">
        {t("auth_oauth_launch_body")}
      </p>
      <button
        type="button"
        disabled={opening}
        aria-busy={opening}
        onClick={() => void handleOpen()}
        className={`mt-6 w-full max-w-sm ${OAUTH_LOGIN_PRIMARY_BUTTON_BASE} ${buttonClassName}`}
      >
        {opening ? (
          <span
            className={`inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${labelClassName}`}
            aria-hidden
          />
        ) : (
          <OAuthLoginProviderIcon provider={provider} size="primary" />
        )}
        <span className={`flex-1 text-center text-[15px] font-semibold ${labelClassName}`}>
          {opening ? t("auth_oauth_redirecting_label") : t(getOAuthLoginContinueLabelKey(provider))}
        </span>
        <span className="h-6 w-6 shrink-0" aria-hidden />
      </button>
      {error ? (
        <button
          type="button"
          className="mt-4 text-sm font-medium text-sam-brand underline"
          onClick={() => void handleOpen()}
        >
          {t("auth_oauth_launch_retry_label")}
        </button>
      ) : null}
    </div>
  );
}
