"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import { collectNativeProviderCredential } from "@/lib/auth/provider-identity/collect-native-provider-credential.client";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  logAuthProviderLinkEvent,
  readStoredConflictStashToken,
} from "@/lib/auth/provider-identity/provider-email-conflict.client";
import { resolveProviderDisplayName } from "@/lib/auth/provider-identity/provider-display";
import { LINKABLE_AUTH_PROVIDERS } from "@/lib/auth/provider-identity/types";
import { Sam } from "@/lib/ui/sam-component-classes";

type LinkedProviderRow = {
  provider: (typeof LINKABLE_AUTH_PROVIDERS)[number];
  linked: boolean;
  linkedAt: string | null;
};

export function LinkedLoginProvidersContent() {
  const { t, language, safeT } = useI18n();
  const [rows, setRows] = useState<LinkedProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const nativeLinkAvailable = isCapacitorNativePlatform();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/me/auth-providers", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; providers?: LinkedProviderRow[] } | null;
      if (json?.ok && Array.isArray(json.providers)) {
        setRows(json.providers);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLink = useCallback(
    async (provider: LinkedProviderRow["provider"]) => {
      setBusyProvider(provider);
      logAuthProviderLinkEvent("auth_provider_link_start", { provider });
      try {
        const credential = await collectNativeProviderCredential(provider);
        const stashToken = readStoredConflictStashToken();
        const completeRes = await fetch("/api/auth/provider/link/complete", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            stashToken: stashToken ?? undefined,
            idToken: credential.idToken,
            accessToken: credential.accessToken,
            identityToken: credential.identityToken,
            userIdentifier: credential.userIdentifier,
            nonce: credential.nonce,
          }),
        });
        const completeJson = (await completeRes.json().catch(() => null)) as {
          ok?: boolean;
          errorCode?: string;
          message?: string;
        } | null;
        if (!completeRes.ok || !completeJson?.ok) {
          logAuthProviderLinkEvent("auth_provider_link_failed", {
            provider,
            errorCode: completeJson?.errorCode ?? "link_failed",
          });
          setHint(
            safeT("auth_provider_link_blocked_toast", {
              fallbackKo: "보안을 위해 기존 로그인 확인이 필요합니다.",
              fallbackEn: "Please verify your existing sign-in method for security.",
            }),
          );
          return;
        }
        logAuthProviderLinkEvent("auth_provider_link_success", { provider });
        const label = resolveProviderDisplayName(provider, language);
        setHint(t("auth_provider_link_success_toast", { provider: label }));
        await refresh();
      } catch {
        logAuthProviderLinkEvent("auth_provider_link_failed", { provider });
      } finally {
        setBusyProvider(null);
      }
    },
    [language, refresh, safeT, t],
  );

  const handleUnlink = useCallback(
    async (provider: LinkedProviderRow["provider"]) => {
      setBusyProvider(provider);
      try {
        const res = await fetch(`/api/me/auth-providers/${provider}`, {
          method: "DELETE",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; errorCode?: string } | null;
        if (!res.ok || !json?.ok) {
          if (json?.errorCode === "last_provider_unlink_blocked") {
            setHint(
              safeT("auth_provider_last_unlink_blocked_toast", {
                fallbackKo: "최소 1개의 로그인 방법은 유지해야 합니다.",
                fallbackEn: "You must keep at least one sign-in method.",
              }),
            );
          }
          return;
        }
        await refresh();
      } finally {
        setBusyProvider(null);
      }
    },
    [refresh, safeT],
  );

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  return (
    <div className="space-y-3">
      {hint ? <p className="sam-text-helper text-sam-fg">{hint}</p> : null}
      {!nativeLinkAvailable ? (
        <p className="sam-text-helper text-sam-muted">{t("mypage_linked_login_native_only_hint")}</p>
      ) : null}
      <p className="sam-text-helper text-sam-muted">{t("mypage_linked_login_providers_desc")}</p>
      {rows.map((row) => {
        const label = resolveProviderDisplayName(row.provider, language);
        const isBusy = busyProvider === row.provider;
        return (
          <div
            key={row.provider}
            className="flex min-h-[52px] items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
          >
            <div>
              <p className="sam-text-body font-medium text-sam-fg">{label}</p>
              <p className="sam-text-helper text-sam-muted">
                {row.linked
                  ? t("mypage_linked_login_provider_linked")
                  : t("mypage_linked_login_provider_not_linked")}
              </p>
            </div>
            {row.linked ? (
              <button
                type="button"
                disabled={isBusy}
                className={`${Sam.btn.ghost} min-h-[40px] px-3 disabled:opacity-50`}
                onClick={() => void handleUnlink(row.provider)}
              >
                {t("mypage_linked_login_provider_unlink")}
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy || !nativeLinkAvailable}
                className={`${Sam.btn.primary} min-h-[40px] px-3 disabled:opacity-50`}
                onClick={() => void handleLink(row.provider)}
              >
                {t("mypage_linked_login_provider_link")}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
