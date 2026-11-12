"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AndroidPlayUpdateScreen } from "@/components/platform/AndroidPlayUpdateScreen";
import { APP_RELEASE_HISTORY_HREF } from "@/lib/app-releases/app-release-paths";
import {
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
} from "@/lib/platform/capacitor-native";
import {
  addAndroidFlexibleDownloadedListener,
  addAndroidPlayInstallStatusListener,
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
  subscribeAndroidImmediateUpdateHeld,
  subscribeAndroidPlayUpdateScreenRequest,
} from "@/lib/platform/android-play-in-app-update-orchestrator";
import {
  readUpdatePromptSafetyInput,
  resolveInstallConfirmOutcome,
  resolvePendingUpdatePrompt,
  resolveUpdatePromptSafety,
  resolveUpdateStartOutcome,
  shouldYieldOpenUpdatePrompt,
  type PendingUpdatePrompt,
} from "@/lib/platform/android-play-update-prompt-gate";
import {
  createUpdateScreenState,
  isUpdateScreenProgressStep,
  reduceUpdateScreenOnInstallEvent,
  shouldApplyPolledInstallStatus,
  type UpdateInstallEvent,
  type UpdateScreenState,
} from "@/lib/platform/android-play-update-screen-model";

/** While a prompt is held: cheap DOM re-check only (Play is queried right before opening). */
const PENDING_RECHECK_MS = 3_000;
/** Held because of an active call: wait this long before asking Play again. */
const CALL_HOLD_BACKOFF_MS = 30_000;
/** Progress steps: re-read Play status (old binaries lose the native listener after a restart). */
const PROGRESS_POLL_MS = 3_000;

type ScreenUpdate =
  | UpdateScreenState
  | null
  | ((current: UpdateScreenState | null) => UpdateScreenState | null);

/**
 * Android-only Play In-App Updates host — ONE full-screen update screen (Owner 2026-11-03 ·
 * 단계형 전체 화면) from 「업데이트」 to install: intro → Play consent → 업데이트 준비 중… →
 * 다운로드 중… N% → 설치 중… (auto install while the screen is open; a call holds it).
 * 「닫기」 hides the screen while Play keeps downloading; when the download finishes the screen
 * reopens as 「업데이트 준비 완료 · 설치」 (D3: 「나중에」 = this app run). Forced update = same screen
 * without 「나중에」/「닫기」. Cold start (8s minimum) + resume check. The intro shows only versions
 * the native plugin reported (D2).
 * U1: prompts are held while unsafe (intro, chat / call / checkout / write routes, other
 * dialogs, text input, background) and re-validated against Play before opening; an open
 * screen yields to calls, other dialogs and sensitive routes (a running download is held as
 * 「progress」 and comes back). U3/U4: failures stay visible.
 */
export function AndroidPlayInAppUpdateHost() {
  const pathname = usePathname();
  const router = useRouter();
  const [screen, setScreenState] = useState<UpdateScreenState | null>(null);
  const [busy, setBusyState] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  /** Forced (IMMEDIATE fallback) update held because the screen was busy — retried when safe. */
  const [immediateHeld, setImmediateHeld] = useState(false);

  const screenRef = useRef<UpdateScreenState | null>(null);
  const busyRef = useRef(false);
  /** completeUpdate in flight — never sent twice. */
  const completingRef = useRef(false);
  const pendingRef = useRef<PendingUpdatePrompt | null>(null);
  const presentingRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  /** During a call Play keeps reporting the prompt as held — back off Play re-queries. */
  const nextPlayCheckAtRef = useRef(0);

  const setScreen = useCallback((next: ScreenUpdate) => {
    const value = typeof next === "function" ? next(screenRef.current) : next;
    screenRef.current = value;
    setScreenState(value);
  }, []);
  const setBusy = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusyState(value);
  }, []);

  const holdPrompt = useCallback((next: PendingUpdatePrompt) => {
    const current = pendingRef.current;
    // Install-ready supersedes a held "available" / "progress" prompt; never downgrade.
    if (current?.kind === "install" && next.kind !== "install") return;
    pendingRef.current = next;
    setHasPending(true);
  }, []);

  const clearPending = useCallback(() => {
    pendingRef.current = null;
    setHasPending(false);
  }, []);

  /** 「설치」 / download finished on an open screen → completeUpdate (Play restarts the app). */
  const runInstall = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setBusy(true);
    try {
      const result = await runAndroidPlayInAppUpdateCheck({ manual: true, confirmComplete: true });
      const outcome = resolveInstallConfirmOutcome(result);
      if (outcome.kind === "keep_open") {
        setScreen((s) => (s ? { ...s, step: "installing", waitingForCall: false, error: null } : s));
      } else if (outcome.kind === "close") {
        setScreen(null);
      } else if (outcome.message === "blocked_by_call") {
        // A call is running: wait on 「업데이트 준비 중…」, install when it ends (progress poll).
        setScreen((s) => (s ? { ...s, step: "preparing", waitingForCall: true, error: null } : s));
      } else {
        setScreen((s) => (s ? { ...s, step: "ready", waitingForCall: false, error: outcome.message } : s));
      }
    } finally {
      completingRef.current = false;
      setBusy(false);
    }
  }, [setBusy, setScreen]);

  /** 「업데이트」 → Play consent (the screen already shows 「업데이트 준비 중…」 behind it). */
  const runStart = useCallback(
    async (manual: boolean) => {
      if (busyRef.current) return;
      setBusy(true);
      setScreen((s) => (s ? { ...s, step: "preparing", percent: null, error: null } : s));
      let installNext = false;
      try {
        const result = await runAndroidPlayInAppUpdateCheck(
          manual ? { manual: true, confirmStart: true } : { confirmStart: true }
        );
        const outcome = resolveUpdateStartOutcome(result);
        if (outcome.kind === "intro") {
          setScreen((s) => (s ? { ...s, step: "intro", error: null } : s));
        } else if (outcome.kind === "close") {
          setScreen(null);
        } else if (outcome.kind === "install") {
          installNext = true;
        } else if (outcome.kind === "error") {
          setScreen((s) => (s ? { ...s, step: "intro", error: outcome.message } : s));
        }
        // "progress": Play events / status reads move the steps forward.
      } finally {
        setBusy(false);
      }
      if (installNext) await runInstall();
    },
    [runInstall, setBusy, setScreen]
  );

  const applyInstallEvent = useCallback(
    (event: UpdateInstallEvent) => {
      const current = screenRef.current;
      if (!current) return;
      const { screen: next, effect } = reduceUpdateScreenOnInstallEvent(current, event);
      if (effect === "close") {
        setScreen(null);
        return;
      }
      setScreen(next);
      if (effect === "complete") void runInstall();
    },
    [runInstall, setScreen]
  );

  const tryPresentPending = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || presentingRef.current) return;
    const open = screenRef.current;
    // A held install prompt replaces an idle intro (no deferral recorded); otherwise wait.
    if (open && !(pending.kind === "install" && open.step === "intro" && !busyRef.current)) return;

    const read = () =>
      resolveUpdatePromptSafety(
        readUpdatePromptSafetyInput({
          pathname: pathnameRef.current,
          callActive: false,
          ownDialogsOpen: open ? 1 : 0,
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
        setScreen(createUpdateScreenState("ready", { forced: open?.forced }));
        return;
      }
      if (resolution.action === "open_progress") {
        const forced = pending.kind === "progress" && pending.forced;
        const reopened = reduceUpdateScreenOnInstallEvent(createUpdateScreenState("preparing", { forced }), {
          installStatus: fresh.info.installStatus,
          bytesDownloaded: fresh.info.bytesDownloaded,
          totalBytesToDownload: fresh.info.totalBytesToDownload,
        });
        setScreen(reopened.screen);
        return;
      }
      setScreen(
        createUpdateScreenState("intro", {
          forced: resolution.payload.forced === true,
          payload: resolution.payload,
        })
      );
    } finally {
      presentingRef.current = false;
    }
  }, [clearPending, setScreen]);

  const tryPresentRef = useRef(tryPresentPending);
  tryPresentRef.current = tryPresentPending;
  const applyInstallEventRef = useRef(applyInstallEvent);
  applyInstallEventRef.current = applyInstallEvent;
  const runStartRef = useRef(runStart);
  runStartRef.current = runStart;
  const runInstallRef = useRef(runInstall);
  runInstallRef.current = runInstall;

  const immediateHeldRef = useRef(false);
  immediateHeldRef.current = immediateHeld;
  /** Held IMMEDIATE: once the screen is safe, re-run the check (orchestrator re-validates). */
  const retryHeldImmediate = useCallback(() => {
    if (!immediateHeldRef.current) return;
    if (screenRef.current) return;
    const safety = resolveUpdatePromptSafety(
      readUpdatePromptSafetyInput({
        pathname: pathnameRef.current,
        callActive: false,
        ownDialogsOpen: 0,
      })
    );
    if (!safety.safe) return;
    immediateHeldRef.current = false;
    setImmediateHeld(false);
    void runAndroidPlayInAppUpdateCheck().then((result) => {
      // Another check was running: keep holding (a still-unsafe screen re-notifies by itself).
      if (result.reason === "in_flight") {
        immediateHeldRef.current = true;
        setImmediateHeld(true);
      }
    });
  }, []);
  const retryHeldImmediateRef = useRef(retryHeldImmediate);
  retryHeldImmediateRef.current = retryHeldImmediate;

  useEffect(() => {
    if (!isCapacitorNativePlatform()) return;
    if (resolveCapacitorShellPlatform() !== "android") return;

    let cancelled = false;
    const presentSoon = () => {
      if (cancelled) return;
      void tryPresentRef.current();
      retryHeldImmediateRef.current();
    };
    const holdInstallReady = () => {
      if (cancelled) return;
      const open = screenRef.current;
      if (open && isUpdateScreenProgressStep(open.step)) {
        // The open screen was following this download — install now (no second confirm).
        applyInstallEventRef.current({ installStatus: "DOWNLOADED" });
        return;
      }
      if (open && open.step !== "intro") return;
      if (isAndroidFlexibleInstallReadyDismissedForThisRun()) return;
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
    const unsubImmediateHeld = subscribeAndroidImmediateUpdateHeld(() => {
      if (cancelled) return;
      immediateHeldRef.current = true;
      setImmediateHeld(true);
    });
    // Version screen 「업데이트」 / 「지금 설치」 → the same screen, started right away (no gate).
    const unsubScreenRequest = subscribeAndroidPlayUpdateScreenRequest((request) => {
      if (cancelled || busyRef.current || completingRef.current) return;
      setScreen(createUpdateScreenState("preparing", { forced: screenRef.current?.forced }));
      if (request.action === "install") void runInstallRef.current();
      else void runStartRef.current(true);
    });
    let removeNative: (() => void) | undefined;
    let removeStatus: (() => void) | undefined;
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
      // Download progress (bytes) → the open screen's percent / step.
      const statusHandle = await addAndroidPlayInstallStatusListener((event) => {
        if (!cancelled) applyInstallEventRef.current(event);
      });
      if (cancelled) {
        void nativeHandle?.remove();
        void statusHandle?.remove();
        return;
      }
      removeNative = () => {
        void nativeHandle?.remove();
      };
      removeStatus = () => {
        void statusHandle?.remove();
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
      unsubImmediateHeld();
      unsubScreenRequest();
      removeNative?.();
      removeStatus?.();
      removeAppState?.();
    };
  }, [holdPrompt, setScreen]);

  // Route change → re-check a held prompt / held forced update.
  useEffect(() => {
    if (hasPending) void tryPresentRef.current();
    if (immediateHeld) retryHeldImmediateRef.current();
  }, [pathname, hasPending, immediateHeld]);

  // Held prompt / forced update: re-check on a short timer while visible (e.g. a dialog closed).
  useEffect(() => {
    if (!hasPending && !immediateHeld) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void tryPresentRef.current();
      retryHeldImmediateRef.current();
    }, PENDING_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [hasPending, immediateHeld]);

  // Progress steps: read Play status (forward states only) and finish a call-held install.
  const progressOpen = screen != null && isUpdateScreenProgressStep(screen.step);
  useEffect(() => {
    if (!progressOpen) return;
    let stopped = false;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current || completingRef.current) return;
      void getAndroidPlayUpdateInfo().then((fresh) => {
        if (stopped || !fresh.ok) return;
        const current = screenRef.current;
        if (!current || !isUpdateScreenProgressStep(current.step)) return;
        if (current.waitingForCall) {
          if (fresh.info.callInProgress !== true && fresh.info.installStatus === "DOWNLOADED") {
            setScreen({ ...current, waitingForCall: false });
            void runInstallRef.current();
          }
          return;
        }
        if (shouldApplyPolledInstallStatus(fresh.info.installStatus)) {
          applyInstallEventRef.current({
            installStatus: fresh.info.installStatus,
            bytesDownloaded: fresh.info.bytesDownloaded,
            totalBytesToDownload: fresh.info.totalBytesToDownload,
          });
        }
      });
    }, PROGRESS_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [progressOpen, setScreen]);

  // Open screen yields to a call / incoming banner / other dialog / sensitive route (held again).
  const anyOpen = screen != null;
  useEffect(() => {
    if (!anyOpen) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const open = screenRef.current;
      if (!open || busyRef.current || completingRef.current) return;
      if (open.step === "installing") return;
      const yieldNow = shouldYieldOpenUpdatePrompt(
        readUpdatePromptSafetyInput({
          pathname: pathnameRef.current,
          callActive: false,
          ownDialogsOpen: 1,
        })
      );
      if (!yieldNow) return;
      setScreen(null);
      if (isUpdateScreenProgressStep(open.step)) {
        holdPrompt({ kind: "progress", forced: open.forced });
      } else if (open.step === "ready") {
        holdPrompt({ kind: "install" });
      } else if (open.payload) {
        holdPrompt({ kind: "available", payload: open.payload });
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
  }, [anyOpen, pathname, holdPrompt, setScreen]);

  if (!isCapacitorNativePlatform() || resolveCapacitorShellPlatform() !== "android") {
    return null;
  }

  return (
    <AndroidPlayUpdateScreen
      screen={screen}
      busy={busy}
      onUpdate={() => {
        if (busyRef.current) return;
        // No payload = opened from the version screen: manual (no deferral record on cancel).
        void runStart(screenRef.current?.payload == null);
      }}
      onLater={() => {
        if (busyRef.current) return;
        const current = screenRef.current;
        if (!current || current.forced) return;
        if (current.step === "ready") {
          dismissAndroidFlexibleInstallReadyForThisRun();
        } else if (current.payload) {
          acknowledgeAndroidPlayUpdateDeferred(current.payload.availableVersionCode);
        }
        setScreen(null);
      }}
      onClose={() => {
        const current = screenRef.current;
        if (!current || current.forced || current.step === "installing") return;
        // Play keeps downloading; the finished download reopens the screen (「설치」).
        setScreen(null);
      }}
      onInstall={() => {
        if (busyRef.current) return;
        void runInstall();
      }}
      onDetails={() => {
        if (busyRef.current) return;
        setScreen(null);
        router.push(APP_RELEASE_HISTORY_HREF);
      }}
    />
  );
}
