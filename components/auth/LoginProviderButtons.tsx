"use client";

import { useCallback, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { sortAuthProviders } from "@/lib/auth/auth-providers";
import { isOAuthLoginStartSupported } from "@/lib/auth/oauth/start-oauth-login";
import {
  getOAuthLoginContinueLabelKey,
  getOAuthLoginPrimaryStyle,
  OAUTH_LOGIN_PRIMARY_BUTTON_BASE,
  OAUTH_LOGIN_SECONDARY_CIRCLE_BASE,
  OAuthLoginProviderIcon,
} from "@/components/auth/OAuthLoginProviderVisuals";

type Props = {
  providers: AuthProviderPublic[];
  disabled?: boolean;
  /** OAuth launch 진행 중인 provider — 해당 버튼만 "이동 중…" + spinner */
  pendingOAuthProvider?: OAuthProvider | null;
  emptyText?: string;
  showEmailEntry?: boolean;
  onEmailLoginClick?: () => void;
  onSelectProvider: (provider: OAuthProvider) => void;
};

const OAUTH_LOGIN_PRIMARY_PROVIDERS = new Set<OAuthProvider>(["kakao", "naver", "apple", "google"]);

function isPrimaryProvider(provider: OAuthProvider): boolean {
  return OAUTH_LOGIN_PRIMARY_PROVIDERS.has(provider);
}

function splitLoginProviders(providers: AuthProviderPublic[]) {
  const sorted = sortAuthProviders(providers);
  const primary: AuthProviderPublic[] = [];
  const secondary: AuthProviderPublic[] = [];

  for (const row of sorted) {
    if (isPrimaryProvider(row.provider)) {
      primary.push(row);
    } else {
      secondary.push(row);
    }
  }

  return { primary, secondary };
}

function OAuthRedirectSpinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

function PrimaryProviderButton({
  provider,
  disabled,
  showRedirecting,
  redirectingLabel,
  label,
  onSelectProvider,
}: {
  provider: OAuthProvider;
  disabled: boolean;
  showRedirecting: boolean;
  redirectingLabel: string;
  label: string;
  onSelectProvider: (provider: OAuthProvider) => void;
}) {
  const style = getOAuthLoginPrimaryStyle(provider);
  const buttonClassName = style?.buttonClassName ?? "border border-sam-border bg-sam-surface";
  const labelClassName = style?.labelClassName ?? "text-sam-fg";

  const handleClick = useCallback(() => {
    if (disabled) return;
    onSelectProvider(provider);
  }, [disabled, onSelectProvider, provider]);

  return (
    <button
      type="button"
      data-provider={provider}
      disabled={disabled}
      aria-busy={showRedirecting}
      onClick={handleClick}
      className={`${OAUTH_LOGIN_PRIMARY_BUTTON_BASE} ${buttonClassName}`}
    >
      {showRedirecting ? (
        <OAuthRedirectSpinner className={labelClassName} />
      ) : (
        <OAuthLoginProviderIcon provider={provider} size="primary" />
      )}
      <span className={`flex-1 text-center text-[15px] font-semibold ${labelClassName}`}>
        {showRedirecting ? redirectingLabel : label}
      </span>
      <span className="h-6 w-6 shrink-0" aria-hidden />
    </button>
  );
}

export function LoginProviderButtons({
  providers,
  disabled = false,
  pendingOAuthProvider = null,
  emptyText,
  showEmailEntry = false,
  onEmailLoginClick,
  onSelectProvider,
}: Props) {
  const { t } = useI18n();
  const visibleProviders = useMemo(
    () => providers.filter((row) => isOAuthLoginStartSupported(row.provider)),
    [providers]
  );

  const { primary, secondary } = useMemo(
    () => splitLoginProviders(visibleProviders),
    [visibleProviders],
  );

  const handleProviderClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (pendingOAuthProvider) return;
      const raw = e.currentTarget.dataset.provider?.trim() ?? "";
      if (raw === "google" || raw === "kakao" || raw === "naver" || raw === "apple") {
        onSelectProvider(raw);
      }
    },
    [onSelectProvider, pendingOAuthProvider],
  );

  const showSecondaryOAuth = secondary.length > 0;
  const showOtherAccountDivider = primary.length > 0 && showSecondaryOAuth;
  const showInternalDivider = showEmailEntry && (primary.length > 0 || showSecondaryOAuth);
  const redirectingLabel = t("auth_oauth_signing_in_label");
  const oauthInFlight = pendingOAuthProvider != null;
  const internalEntryLabel = t("auth_login_internal_entry");

  if (visibleProviders.length === 0 && !showEmailEntry) {
    return emptyText ? <p className="sam-text-body-secondary text-sam-muted">{emptyText}</p> : null;
  }

  return (
    <div className="space-y-3" data-auth-customer-surface="social-primary">
      {primary.length > 0 ? (
        <div className="space-y-2.5">
          {primary.map((row) => {
            const isPending = pendingOAuthProvider === row.provider;
            return (
              <PrimaryProviderButton
                key={row.provider}
                provider={row.provider}
                disabled={disabled || oauthInFlight}
                showRedirecting={isPending}
                redirectingLabel={redirectingLabel}
                label={t(getOAuthLoginContinueLabelKey(row.provider))}
                onSelectProvider={onSelectProvider}
              />
            );
          })}
        </div>
      ) : null}

      {showOtherAccountDivider ? (
        <div className="flex items-center gap-3 sam-text-helper text-sam-meta">
          <div className="h-px flex-1 bg-sam-border-soft" />
          <span className="whitespace-nowrap">{t("auth_login_divider_other_account")}</span>
          <div className="h-px flex-1 bg-sam-border-soft" />
        </div>
      ) : null}

      {showSecondaryOAuth ? (
        <div className="flex items-center justify-center gap-4">
          {secondary.map((row) => {
            const isPending = pendingOAuthProvider === row.provider;
            return (
              <button
                key={row.provider}
                type="button"
                data-provider={row.provider}
                disabled={disabled || oauthInFlight}
                aria-busy={isPending}
                onClick={handleProviderClick}
                aria-label={
                  isPending
                    ? redirectingLabel
                    : t(getOAuthLoginContinueLabelKey(row.provider))
                }
                className={`${OAUTH_LOGIN_SECONDARY_CIRCLE_BASE} bg-[#1877F2]`}
              >
                {isPending ? (
                  <OAuthRedirectSpinner className="text-white" />
                ) : (
                  <OAuthLoginProviderIcon provider={row.provider} size="secondary" />
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {showInternalDivider ? (
        <div className="flex items-center gap-3 sam-text-helper text-sam-meta">
          <div className="h-px flex-1 bg-sam-border-soft" />
          <span className="whitespace-nowrap">{t("auth_login_divider_id_password")}</span>
          <div className="h-px flex-1 bg-sam-border-soft" />
        </div>
      ) : null}

      {showEmailEntry ? (
        <button
          type="button"
          data-auth-surface="internal"
          data-testid="auth-internal-login-entry"
          disabled={disabled || oauthInFlight}
          onClick={onEmailLoginClick}
          aria-label={t("auth_login_email_dev_aria")}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 text-center text-[13px] font-medium text-sam-muted transition-colors hover:bg-sam-app hover:text-sam-fg disabled:opacity-50"
        >
          {internalEntryLabel}
        </button>
      ) : null}
    </div>
  );
}
