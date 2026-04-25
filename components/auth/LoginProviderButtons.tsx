"use client";

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
  if (providers.length === 0) {
    return emptyText ? <p className="sam-text-body-secondary text-sam-muted">{emptyText}</p> : null;
  }
  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <button
          key={provider.provider}
          type="button"
          disabled={disabled}
          onClick={() => onSelectProvider(provider.provider)}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
        >
          {busyProvider === provider.provider
            ? "이동 중…"
            : `${getButtonLabel(provider.provider)}로 계속하기`}
        </button>
      ))}
    </div>
  );
}
