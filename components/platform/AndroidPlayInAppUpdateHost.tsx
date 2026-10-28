"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import { formatInstalledVersionLabel } from "@/lib/platform/format-installed-version-label";
import {
  addAndroidFlexibleDownloadedListener,
  getAndroidPlayUpdateInfo,
} from "@/lib/platform/android-play-in-app-update";
import {
  acknowledgeAndroidPlayUpdateDeferred,
  dismissAndroidFlexibleInstallReadyForThisRun,
  isAndroidFlexibleInstallReadyDismissedForThisRun,
  runAndroidPlayInAppUpdateCheck,
  type AndroidPlayUpdateAvailablePayload,
  subscribeAndroidFlexibleInstallReady,
  subscribeAndroidFlexibleUpdateAvailable,
} from "@/lib/platform/android-play-in-app-update-orchestrator";
import {
  readUpdatePromptSafetyInput,
  resolveInstallConfirmOutcome,
  resolvePendingUpdatePrompt,
  resolveUpdatePromptSafety,
  resolveUpdateStartConfirmOutcome,
  shouldYieldOpenUpdatePrompt,
  type PendingUpdatePrompt,
  type UpdateConfirmOutcome,
} from "@/lib/platform/android-play-update-prompt-gate";

/** While a prompt is held: cheap DOM re-check only (Play is queried right before opening). */
const PENDING_RECHECK_MS = 3_000;
/** Held because of an active call: wait this long before asking Play again. */
const CALL_HOLD_BACKOFF_MS = 30_000;

type ErrorMessage = Extract<UpdateConfirmOutcome, { kind: "error" }>["message"];

/**
 * Android-only Play In-App Updates host.
 * Cold start (8s minimum) + resume check (FLEXIBLE default with confirm). Never mounts Play UI
 * during calls (native plugin rejects call_in_progress). Flexible install requires explicit confirm.
 * Available dialog shows only versions the native plugin reported (D2).
 * Install-ready "나중에" hides it for this app run; native events re-check Play state (D3).
 * U1: prompts are held while unsafe (intro, chat / call / checkout / write routes, other
 * dialogs, text input, background) and re-validated against Play before opening; an open
 * prompt yields to calls, other dialogs and sensitive routes. U3/U4: failures stay visible.
 */
export function AndroidPlayInAppUpdateHost() {
  const { safeT } = useI18n();
  const pathname = usePathname();
  const [availableOpen, setAvailableOpen] = useState(false);
  const [availableBusy, setAvailableBusy] = useState(false);
  const [availablePayload, setAvailablePayload] =
    useState<AndroidPlayUpdateAvailablePayload | null>(null);
  const [availableError, setAvailableError] = useState<ErrorMessage | null>(null);
  const [installReadyOpen, setInstallReadyOpen] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [installError, setInstallError] = useState<ErrorMessage | null>(null);
  const [hasPending, setHasPending] = useState(false);

  const pendingRef = useRef<PendingUpdatePrompt | null>(null);
  const presentingRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const openStateRef = useRef({ availableOpen, installReadyOpen, availableBusy, installBusy });
  openStateRef.current = { availableOpen, installReadyOpen, availableBusy, installBusy };
  const availablePayloadRef = useRef(availablePayload);
  availablePayloadRef.current = availablePayload;
  /** During a call Play keeps reporting the prompt as held — back off Play re-queries. */
  const nextPlayCheckAtRef = useRef(0);

  const holdPrompt = useCallback((next: PendingUpdatePrompt) => {
    const current = pendingRef.current;
    // Install-ready supersedes a held "available" prompt; never downgrade.
    if (current?.kind === "install" && next.kind === "available") return;
    pendingRef.current = next;
    setHasPending(true);
  }, []);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    setHasPending(false);
  }, []);

  const tryPresentPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || presentingRef.current) return;
    const open = openStateRef.current;
    if (open.installReadyOpen) return;
    if (open.availableOpen && pending.kind === "available") return;
    // A held install prompt replaces an idle available dialog (no deferral recorded).
    if (open.availableOpen && open.availableBusy) return;
    const ownOpen = open.availableOpen ? 1 : 0;

    const read = () =>
      resolveUpdatePromptSafety(
        readUpdatePromptSafetyInput({
          pathname: pathnameRef.current,
          callActive: false,
          ownDialogsOpen: ownOpen,
        })
      );
    if (!read().safe) return;
    if (Date.now() < nextPlayCheckAtRef.current) return;

    presentingRef.current = true;
    try {
      const fresh = await getAndroidPlayUpdateInfo();
      if (pendingRef.current !== pending) return;
      if (!fresh.ok) {
        // State unknown: drop; the next cold start / resume check detects it again.
        clearPending();
        return;
      }
      const resolution = resolvePendingUpdatePrompt({
        pending,
        info: fresh.info,
        installReadyDismissed: isAndroidFlexibleInstallReadyDismissedForThisRun(),
      });
      if (resolution.action === "keep") {
        nextPlayCheckAtRef.current = Date.now() + CALL_HOLD_BACKOFF_MS;
        return;
      }
      if (resolution.action === "drop") {
        clearPending();
        return;
      }
      if (!read().safe) return;
      clearPending();
      if (resolution.action === "open_install") {
        setAvailableOpen(false);
        setInstallError(null);
        setInstallReadyOpen(true);
        return;
      }
      setAvailablePayload(resolution.payload);
      setAvailableError(null);
      setAvailableOpen(true);
    } finally {
      presentingRef.current = false;
    }
  }, [clearPending]);

  const tryPresentRef = useRef(tryPresentPending);
  tryPresentRef.current = tryPresentPending;

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    if (resolveCapacitorShellPlatform() !== "android") return;

    let cancelled = false;
    const presentSoon = () => {
      if (!cancelled) void tryPresentRef.current();
    };
    const holdInstallReady = () => {
      if (cancelled || isAndroidFlexibleInstallReadyDismissedForThisRun()) return;
      holdPrompt({ kind: "install" });
      presentSoon();
    };
    const holdAvailable = (payload: AndroidPlayUpdateAvailablePayload) => {
      if (cancelled) return;
      holdPrompt({ kind: "available", payload });
      presentSoon();
    };

    const unsubInstall = subscribeAndroidFlexibleInstallReady(holdInstallReady);
    const unsubAvailable = subscribeAndroidFlexibleUpdateAvailable(holdAvailable);
    let removeNative: (() => void) | undefined;
    let removeAppState: (() => void) | undefined;
    let coldStartTimer: number | undefined;

    const onVisibility = () => {
      if (document.visibilityState === "visible") presentSoon();
    };
    const onFocusOut = () => {
      window.setTimeout(presentSoon, 0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("focusout", onFocusOut);

    void (async () => {
      // Native "downloaded" events can be retained/replayed — held, then re-validated on open.
      const nativeHandle = await addAndroidFlexibleDownloadedListener(holdInstallReady);
      if (cancelled) {
        void nativeHandle?.remove();
        return;
      }
      removeNative = () => {
        void nativeHandle?.remove();
      };

      // Cold start: 8s is the minimum wait; the safety gate decides when it is shown.
      coldStartTimer = window.setTimeout(() => {
        if (!cancelled) void runAndroidPlayInAppUpdateCheck();
      }, 8_000);

      const { App } = await import("@capacitor/app");
      const appStateHandle = await App.addListener("appStateChange", ({ isActive }) => {
        if (!isActive || cancelled) return;
        nextPlayCheckAtRef.current = 0;
        presentSoon();
        void runAndroidPlayInAppUpdateCheck();
      });
      removeAppState = () => {
        void appStateHandle.remove();
      };
    })();

    return () => {
      cancelled = true;
      if (coldStartTimer != null) window.clearTimeout(coldStartTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("focusout", onFocusOut);
      unsubInstall();
      unsubAvailable();
      removeNative?.();
      removeAppState?.();
    };
  }, [holdPrompt]);

  // Route change → re-check a held prompt.
  useEffect(() => {
    if (hasPending) void tryPresentRef.current();
  }, [pathname, hasPending]);

  // Held prompt: re-check on a short timer while visible (e.g. another dialog closed).
  useEffect(() => {
    if (!hasPending) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void tryPresentRef.current();
    }, PENDING_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [hasPending]);

  // Open prompt yields to a call / incoming banner / other dialog / sensitive route (held again).
  const anyOpen = availableOpen || installReadyOpen;
  useEffect(() => {
    if (!anyOpen) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const open = openStateRef.current;
      if (open.availableBusy || open.installBusy) return;
      const yieldNow = shouldYieldOpenUpdatePrompt(
        readUpdatePromptSafetyInput({
          pathname: pathnameRef.current,
          callActive: false,
          ownDialogsOpen: 1,
        })
      );
      if (!yieldNow) return;
      if (open.installReadyOpen) {
        setInstallReadyOpen(false);
        holdPrompt({ kind: "install" });
      } else if (open.availableOpen && availablePayloadRef.current) {
        setAvailableOpen(false);
        holdPrompt({ kind: "available", payload: availablePayloadRef.current });
      }
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(check);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [anyOpen, pathname, holdPrompt]);

  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return null;
  }

  const errorText = (message: ErrorMessage | null): string | null => {
    if (message === "blocked_by_call") {
      return safeT("settings_version_blocked_by_call", {
        fallbackKo: "통화 중에는 업데이트를 시작할 수 없습니다",
        fallbackEn: "Updates cannot start while a call is in progress",
      });
    }
    if (message === "start_failed") {
      return safeT("settings_version_start_failed", {
        fallbackKo: "업데이트를 시작하지 못했습니다",
        fallbackEn: "Could not start the update",
      });
    }
    if (message === "install_failed") {
      return safeT("settings_version_install_failed", {
        fallbackKo: "업데이트 설치를 시작하지 못했습니다",
        fallbackEn: "Could not start installing the update",
      });
    }
    return null;
  };
  const renderError = (message: ErrorMessage | null) => {
    const text = errorText(message);
    return text ? (
      <span className="mt-2 block text-sam-danger" role="alert" data-testid="android-play-update-error">
        {text}
      </span>
    ) : null;
  };

  const installedLabel = formatInstalledVersionLabel(
    availablePayload?.installedVersionName,
    availablePayload?.installedVersionCode
  );
  const availableCode = availablePayload?.availableVersionCode;
  const availableBuild = availableCode != null && availableCode > 0 ? availableCode : null;
  const availableDescription = safeT("settings_version_update_available_desc", {
    fallbackKo: "Google Play에서 새 버전을 받을 수 있습니다. 지금 업데이트하거나 나중에 할 수 있습니다.",
    fallbackEn: "A newer version is available on Google Play. Update now or later.",
  });

  return (
    <>
      <DibayConfirmDialog
        open={availableOpen}
        blocking={false}
        busy={availableBusy}
        title={safeT("settings_version_update_available_title", {
          fallbackKo: "새로운 DIBAY 업데이트가 있습니다",
          fallbackEn: "A new DIBAY update is available",
        })}
        description={
          <>
            {availableDescription}
            {installedLabel || availableBuild != null ? (
              <span className="mt-2 block tabular-nums" data-testid="android-play-update-versions">
                {installedLabel ? (
                  <span className="block">
                    {safeT("settings_version_current_label", {
                      fallbackKo: "현재 버전",
                      fallbackEn: "Current version",
                    })}{" "}
                    <span className="font-semibold text-sam-fg">{installedLabel}</span>
                  </span>
                ) : null}
                {availableBuild != null ? (
                  <span className="block">
                    {safeT("settings_version_new_build_label", {
                      fallbackKo: "새 빌드",
                      fallbackEn: "New build",
                    })}{" "}
                    <span className="font-semibold text-sam-fg">{availableBuild}</span>
                  </span>
                ) : null}
              </span>
            ) : null}
            {renderError(availableError)}
          </>
        }
        cancelLabel={safeT("settings_version_install_later", {
          fallbackKo: "나중에",
          fallbackEn: "Later",
        })}
        confirmLabel={safeT("settings_version_update_now", {
          fallbackKo: "지금 업데이트",
          fallbackEn: "Update now",
        })}
        onCancel={() => {
          if (availableBusy) return;
          acknowledgeAndroidPlayUpdateDeferred(availablePayload?.availableVersionCode);
          setAvailableError(null);
          setAvailableOpen(false);
        }}
        onConfirm={() => {
          if (availableBusy) return;
          setAvailableBusy(true);
          setAvailableError(null);
          void (async () => {
            const result = await runAndroidPlayInAppUpdateCheck({
              confirmStart: true,
            });
            setAvailableBusy(false);
            const outcome = resolveUpdateStartConfirmOutcome(result);
            if (outcome.kind === "error") {
              setAvailableError(outcome.message);
              return;
            }
            setAvailableOpen(false);
          })();
        }}
      />
      <DibayConfirmDialog
        open={installReadyOpen}
        blocking={false}
        busy={installBusy}
        title={safeT("settings_version_install_ready_title", {
          fallbackKo: "업데이트가 준비되었습니다",
          fallbackEn: "Update ready to install",
        })}
        description={
          <>
            {safeT("settings_version_install_ready_desc", {
              fallbackKo: "다운로드가 완료되었습니다. 지금 설치하면 앱이 다시 시작됩니다.",
              fallbackEn: "Download finished. Installing now will restart the app.",
            })}
            {renderError(installError)}
          </>
        }
        cancelLabel={safeT("settings_version_install_later", {
          fallbackKo: "나중에",
          fallbackEn: "Later",
        })}
        confirmLabel={safeT("settings_version_install_now", {
          fallbackKo: "지금 설치",
          fallbackEn: "Install now",
        })}
        onCancel={() => {
          if (installBusy) return;
          dismissAndroidFlexibleInstallReadyForThisRun();
          setInstallError(null);
          setInstallReadyOpen(false);
        }}
        onConfirm={() => {
          if (installBusy) return;
          setInstallBusy(true);
          setInstallError(null);
          void (async () => {
            const result = await runAndroidPlayInAppUpdateCheck({
              manual: true,
              confirmComplete: true,
            });
            setInstallBusy(false);
            const outcome = resolveInstallConfirmOutcome(result);
            if (outcome.kind === "error") {
              setInstallError(outcome.message);
              return;
            }
            // keep_open: completeUpdate restarts the process; keep dialog until then.
            if (outcome.kind === "close") setInstallReadyOpen(false);
          })();
        }}
      />
    </>
  );
}
