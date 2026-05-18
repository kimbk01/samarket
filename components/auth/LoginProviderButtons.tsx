"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AuthProviderPublic, OAuthProvider } from "@/lib/auth/auth-providers";

type Props = {
  providers: AuthProviderPublic[];
  disabled?: boolean;
  busyProvider?: string | null;
  emptyText?: string;
  onSelectProvider: (provider: OAuthProvider) => void;
};

function getButtonLabel(provider: OAuthProvider): string {
  if (provider === "google") return "Google";
  if (provider === "kakao") return "Kakao";
  if (provider === "naver") return "Naver";
  if (provider === "apple") return "Apple";
  return "Facebook";
}

export function LoginProviderButtons({
  providers,
  disabled = false,
  busyProvider = null,
  emptyText,
  onSelectProvider,
}: Props) {
  const { t } = useI18n();
  const handleProviderClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const raw = e.currentTarget.dataset.provider?.trim() ?? "";
      if (raw === "google" || raw === "kakao" || raw === "naver" || raw === "apple" || raw === "facebook") {
        onSelectProvider(raw);
      }
    },
    [onSelectProvider]
  );

  if (providers.length === 0) {
    return emptyText ? <p className="sam-text-body-secondary text-sam-muted">{emptyText}</p> : null;
  }
  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <button
          key={provider.provider}
          type="button"
          data-provider={provider.provider}
          disabled={disabled}
          onClick={handleProviderClick}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
        >
          {busyProvider === provider.provider
            ? t("auth_provider_busy")
            : t("auth_provider_continue", { provider: getButtonLabel(provider.provider) })}
        </button>
      ))}
    </div>
  );
}
