"use client";

import { useCallback, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";
import { sortAuthProviders } from "@/lib/auth/auth-providers";
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
  busyProvider?: string | null;
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
    if (row.provider === "facebook") {
      secondary.push(row);
    } else if (isPrimaryProvider(row.provider)) {
      primary.push(row);
    } else {
      primary.push(row);
    }
  }

  const facebookOnly = primary.length === 0 && secondary.length > 0;
  if (facebookOnly) {
    return { primary: secondary, secondary: [] as AuthProviderPublic[] };
  }

  return { primary, secondary };
}

function PrimaryProviderButton({
  provider,
  disabled,
  busy,
  busyLabel,
  label,
  onSelectProvider,
}: {
  provider: OAuthProvider;
  disabled: boolean;
  busy: boolean;
  busyLabel: string;
  label: string;
  onSelectProvider: (provider: OAuthProvider) => void;
}) {
  const style = getOAuthLoginPrimaryStyle(provider);
  const buttonClassName = style?.buttonClassName ?? "border border-sam-border bg-sam-surface";
  const labelClassName = style?.labelClassName ?? "text-sam-fg";

  const handleClick = useCallback(() => {
    onSelectProvider(provider);
  }, [onSelectProvider, provider]);

  return (
    <button
      type="button"
      data-provider={provider}
      disabled={disabled}
      onClick={handleClick}
      className={`${OAUTH_LOGIN_PRIMARY_BUTTON_BASE} ${buttonClassName}`}
    >
      <OAuthLoginProviderIcon provider={provider} size="primary" />
      <span className={`flex-1 text-center text-[15px] font-semibold ${labelClassName}`}>
        {busy ? busyLabel : label}
      </span>
      <span className="h-6 w-6 shrink-0" aria-hidden />
    </button>
  );
}

export function LoginProviderButtons({
  providers,
  disabled = false,
  busyProvider = null,
  emptyText,
  showEmailEntry = false,
  onEmailLoginClick,
  onSelectProvider,
}: Props) {
  const { t } = useI18n();

  const { primary, secondary } = useMemo(() => splitLoginProviders(providers), [providers]);

  const handleProviderClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const raw = e.currentTarget.dataset.provider?.trim() ?? "";
      if (raw === "google" || raw === "kakao" || raw === "naver" || raw === "apple" || raw === "facebook") {
        onSelectProvider(raw);
      }
    },
    [onSelectProvider],
  );

  const showDivider = primary.length > 0 && (secondary.length > 0 || showEmailEntry);
  const busyLabel = t("auth_provider_busy");

  if (providers.length === 0) {
    return emptyText ? <p className="sam-text-body-secondary text-sam-muted">{emptyText}</p> : null;
  }

  return (
    <div className="space-y-3">
      {primary.length > 0 ? (
        <div className="space-y-2.5">
          {primary.map((row) => (
            <PrimaryProviderButton
              key={row.provider}
              provider={row.provider}
              disabled={disabled}
              busy={busyProvider === row.provider}
              busyLabel={busyLabel}
              label={t(getOAuthLoginContinueLabelKey(row.provider))}
              onSelectProvider={onSelectProvider}
            />
          ))}
        </div>
      ) : null}

      {showDivider ? (
        <div className="flex items-center gap-3 sam-text-helper text-sam-meta">
          <div className="h-px flex-1 bg-sam-border-soft" />
          <span className="whitespace-nowrap">{t("auth_login_divider_other_account")}</span>
          <div className="h-px flex-1 bg-sam-border-soft" />
        </div>
      ) : null}

      {secondary.length > 0 || showEmailEntry ? (
        <div className="flex items-center justify-center gap-4">
          {secondary.map((row) => (
            <button
              key={row.provider}
              type="button"
              data-provider={row.provider}
              disabled={disabled}
              onClick={handleProviderClick}
              aria-label={t(getOAuthLoginContinueLabelKey(row.provider))}
              className={`${OAUTH_LOGIN_SECONDARY_CIRCLE_BASE} bg-[#1877F2]`}
            >
              {busyProvider === row.provider ? (
                <span className="text-xs font-semibold text-white">{busyLabel}</span>
              ) : (
                <OAuthLoginProviderIcon provider={row.provider} size="secondary" />
              )}
            </button>
          ))}
          {showEmailEntry ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onEmailLoginClick}
              aria-label={t("auth_login_email_dev_aria")}
              className={`${OAUTH_LOGIN_SECONDARY_CIRCLE_BASE} bg-[#9aa0a6]`}
            >
              <OAuthLoginProviderIcon provider="email" size="secondary" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
