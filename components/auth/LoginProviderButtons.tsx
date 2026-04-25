"use client";

import type { AuthLoginSetting, LoginSettingProvider } from "@/lib/auth/login-settings";

type Props = {
  settings: AuthLoginSetting[];
  disabled?: boolean;
  busyProvider?: string | null;
  emptyText?: string;
  onSelectProvider: (provider: Exclude<LoginSettingProvider, "password">) => void;
};

export function LoginProviderButtons({
  settings,
  disabled = false,
  busyProvider = null,
  emptyText,
  onSelectProvider,
}: Props) {
  const providers = settings.filter(
    (item): item is AuthLoginSetting & { provider: Exclude<LoginSettingProvider, "password"> } =>
      item.enabled && item.provider !== "password"
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
          disabled={disabled}
          onClick={() => onSelectProvider(provider.provider)}
          className="w-full rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body font-medium text-sam-fg transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
        >
          {busyProvider === provider.provider ? "이동 중…" : `${provider.label}로 계속하기`}
        </button>
      ))}
    </div>
  );
}
