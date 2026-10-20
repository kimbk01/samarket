"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { collectNativeProviderCredential } from "@/lib/auth/provider-identity/collect-native-provider-credential.client";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import {
  logAuthProviderLinkEvent,
  readStoredConflictStashToken,
} from "@/lib/auth/provider-identity/provider-email-conflict.client";
import { resolveProviderDisplayName } from "@/lib/auth/provider-identity/provider-display";
import { Sam } from "@/lib/ui/sam-component-classes";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { forgetSingleFlight } from "@/lib/http/run-single-flight";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import {
  ME_AUTH_PROVIDERS_FLIGHT_KEY,
  canUnlinkAuthProvider,
  countLinkedAuthProviders,
  fetchMeAuthProviders,
  type MeAuthProviderRow,
} from "@/lib/mypage/fetch-me-auth-providers";

type LinkedProviderRow = MeAuthProviderRow;

/**
 * 연동 로그인 (최종 설계 S10 그룹 · S53 규칙, X14) — 기기 권한 화면 안 독립 그룹.
 * 조회 실패 = 오류 + [다시 시도](빈 목록 금지) · 해제 = 확인 시트 · 결과 = 토스트.
 */
export function LinkedLoginProvidersContent({ onLoaded }: { onLoaded?: () => void } = {}) {
  const { t, language, safeT } = useI18n();
  const [rows, setRows] = useState<LinkedProviderRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<LinkedProviderRow | null>(null);
  const { run } = useMypageSubmitGuard();
  const nativeLinkAvailable = isCapacitorNativePlatform();

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadState("loading");
    forgetSingleFlight(ME_AUTH_PROVIDERS_FLIGHT_KEY);
    const result = await fetchMeAuthProviders();
    if (result.ok) {
      setRows(result.providers);
      setLoadState("ready");
    } else if (!opts?.silent) {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loadState !== "loading") onLoaded?.();
  }, [loadState, onLoaded]);

  const linkedCount = countLinkedAuthProviders(rows);

  const handleLink = (provider: LinkedProviderRow["provider"]) =>
    run(async () => {
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
          showMypageToast(
            safeT("auth_provider_link_blocked_toast", {
              fallbackKo: "보안을 위해 기존 로그인 확인이 필요합니다.",
              fallbackEn: "Please verify your existing sign-in method for security.",
            }),
            "error",
          );
          return;
        }
        logAuthProviderLinkEvent("auth_provider_link_success", { provider });
        const label = resolveProviderDisplayName(provider, language);
        showMypageToast(t("auth_provider_link_success_toast", { provider: label }), "success");
        await refresh({ silent: true });
      } catch {
        logAuthProviderLinkEvent("auth_provider_link_failed", { provider });
        showMypageToast(t("mypage_s10_link_failed"), "error");
      } finally {
        setBusyProvider(null);
      }
    });

  const handleUnlink = (provider: LinkedProviderRow["provider"]) =>
    run(async () => {
      setBusyProvider(provider);
      try {
        const res = await fetch(`/api/me/auth-providers/${provider}`, {
          method: "DELETE",
          credentials: "include",
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; errorCode?: string } | null;
        if (!res.ok || !json?.ok) {
          showMypageToast(
            json?.errorCode === "last_provider_unlink_blocked"
              ? safeT("auth_provider_last_unlink_blocked_toast", {
                  fallbackKo: "최소 1개의 로그인 방법은 유지해야 합니다.",
                  fallbackEn: "You must keep at least one sign-in method.",
                })
              : t("mypage_s10_unlink_failed"),
            "error",
          );
          return;
        }
        showMypageToast(
          t("mypage_s10_unlinked_toast", { provider: resolveProviderDisplayName(provider, language) }),
          "success",
        );
        await refresh({ silent: true });
      } catch {
        showMypageToast(t("mypage_s10_unlink_failed"), "error");
      } finally {
        setBusyProvider(null);
      }
    });

  if (loadState === "loading") {
    return <MyStateView kind="loading" template="list" rows={3} />;
  }
  if (loadState === "error") {
    return (
      <MyStateView
        kind="error"
        template="list"
        error={{ message: t("mypage_s10_linked_load_failed"), onRetry: () => void refresh() }}
      />
    );
  }

  const unlinkLabel = unlinkTarget ? resolveProviderDisplayName(unlinkTarget.provider, language) : "";

  return (
    <div className="space-y-3" data-testid="linked-login-providers">
      <p className="sam-text-helper text-sam-muted">{t("mypage_linked_login_providers_desc")}</p>
      {!nativeLinkAvailable ? (
        <p className="sam-text-helper text-sam-muted">{t("mypage_linked_login_native_only_hint")}</p>
      ) : null}
      <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
        {rows.map((row, idx) => {
          const label = resolveProviderDisplayName(row.provider, language);
          const isBusy = busyProvider === row.provider;
          const unlinkable = canUnlinkAuthProvider(row, linkedCount);
          const linkedAt = row.linkedAt ? formatMypageDate(row.linkedAt) : "";
          return (
            <div
              key={row.provider}
              data-testid={`linked-login-row-${row.provider}`}
              className={`flex min-h-[52px] items-center justify-between gap-3 px-4 py-3 md:px-5 ${
                idx === 0 ? "" : "border-t border-sam-border-soft"
              }`}
            >
              <div className="min-w-0">
                <p className="sam-text-body font-semibold text-sam-fg">{label}</p>
                <p className="sam-text-helper text-sam-muted">
                  {row.linked
                    ? linkedAt
                      ? t("mypage_s10_linked_since", { date: linkedAt })
                      : t("mypage_linked_login_provider_linked")
                    : t("mypage_linked_login_provider_not_linked")}
                </p>
                {row.linked && !unlinkable ? (
                  <p className="sam-text-helper text-sam-muted" data-testid="linked-login-keep-one">
                    {t("mypage_s10_keep_one_hint")}
                  </p>
                ) : null}
              </div>
              {row.linked ? (
                <button
                  type="button"
                  disabled={isBusy || !unlinkable}
                  data-testid={`linked-login-unlink-${row.provider}`}
                  className={`${Sam.btn.secondaryCombo} ${Sam.btn.sm} ${Sam.focusRing} shrink-0 disabled:opacity-45`}
                  onClick={() => setUnlinkTarget(row)}
                >
                  {t("mypage_linked_login_provider_unlink")}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isBusy || !nativeLinkAvailable}
                  className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} ${Sam.focusRing} shrink-0 disabled:opacity-45`}
                  onClick={() => void handleLink(row.provider)}
                >
                  {t("mypage_linked_login_provider_link")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <MobileConfirmBottomSheet
        open={unlinkTarget != null}
        title={t("mypage_s10_unlink_confirm_title", { provider: unlinkLabel })}
        description={t("mypage_s10_unlink_confirm_body")}
        cancelLabel={t("common_cancel")}
        confirmLabel={t("mypage_linked_login_provider_unlink")}
        confirmTone="danger"
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={() => {
          const target = unlinkTarget;
          setUnlinkTarget(null);
          if (target) void handleUnlink(target.provider);
        }}
      />
    </div>
  );
}
