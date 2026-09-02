"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { isAppShellReady, whenAppShellReady } from "@/lib/startup/startup-metrics";
import { isSupportModalOpen, subscribeSupportModalState } from "@/lib/support/support-modal-controller";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";
import { getOrCreatePlatformPopupAppSessionId } from "@/lib/platform-popup/popup-app-session";
import {
  readPlatformPopupCallRuntimeSnapshot,
  subscribePlatformPopupCallRuntime,
} from "@/lib/platform-popup/popup-call-runtime";
import {
  getPlatformPopupCriticalRuntimeFlags,
  subscribePlatformPopupCriticalRuntimeFlags,
} from "@/lib/platform-popup/popup-critical-runtime-flags";
import {
  mayMountPlatformPopupPresentation,
  reducePlatformPopupHostState,
  type PlatformPopupHostState,
} from "@/lib/platform-popup/popup-host-machine";
import {
  isPopupRuntimeEligible,
  type PopupRuntimeContext,
} from "@/lib/platform-popup/popup-runtime-context";
import {
  resolveDibaySurface,
  toResolveDibaySurfaceContext,
} from "@/lib/platform-popup";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { canAcceptPlatformPopupWinner } from "@/lib/platform-popup/popup-stale-guard";

type ResolveWinner = {
  campaignId: string;
  creativeId: string;
  surface: string;
  href: string;
};

function subscribeVisibility(onStore: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => onStore();
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

function readForeground(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function subscribeOrientation(onStore: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(orientation: landscape)");
  const handler = () => onStore();
  mq.addEventListener?.("change", handler);
  window.addEventListener("resize", handler);
  return () => {
    mq.removeEventListener?.("change", handler);
    window.removeEventListener("resize", handler);
  };
}

function readLandscape(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(orientation: landscape)").matches;
}

function validateWinnerHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) {
    return validatePlatformPopupCta({
      ctaType: "internal_page",
      ctaTarget: trimmed,
    }).ok;
  }
  return validatePlatformPopupCta({
    ctaType: "external_url",
    externalUrl: trimmed,
  }).ok;
}

/**
 * CUT 2 GlobalPopupHost — ONE mount in ConditionalAppShell.
 * Runtime consumer of CUT 1 resolvers. Final visual is CUT 3.
 */
export function GlobalPopupHost() {
  const pathname = usePathname() ?? "/";
  const membership = useClientMembershipState("platform-popup-host");
  const criticalFlags = useSyncExternalStore(
    subscribePlatformPopupCriticalRuntimeFlags,
    getPlatformPopupCriticalRuntimeFlags,
    getPlatformPopupCriticalRuntimeFlags
  );
  const supportOpen = useSyncExternalStore(
    subscribeSupportModalState,
    isSupportModalOpen,
    () => false
  );
  const isForeground = useSyncExternalStore(subscribeVisibility, readForeground, () => true);
  const isLandscape = useSyncExternalStore(subscribeOrientation, readLandscape, () => false);
  const call = useSyncExternalStore(
    subscribePlatformPopupCallRuntime,
    readPlatformPopupCallRuntimeSnapshot,
    () => ({ incomingCall: false, activeCall: false, nativeCallTransition: false })
  );

  const storesLcpDeferred = useStoresHomeOverlayDeferUntilInput();
  const [shellReady, setShellReady] = useState(() => isAppShellReady());

  useEffect(() => {
    if (shellReady) return;
    return whenAppShellReady(() => setShellReady(true));
  }, [shellReady]);

  const authReady = membership.status !== "checking";
  const userId = membership.status === "member" ? membership.profile.id : null;

  const appSessionId = useMemo(() => getOrCreatePlatformPopupAppSessionId(), []);
  const deviceKey = useMemo(() => {
    if (typeof window === "undefined") return "ssr";
    return ensureClientInstanceId();
  }, []);

  const runtimeCtx: PopupRuntimeContext = useMemo(() => {
    const criticalUi = {
      callIncoming: call.incomingCall,
      callActive: call.activeCall,
      nativeCallTransition: call.nativeCallTransition,
      paymentCritical: criticalFlags.paymentCritical,
      orderSubmitCritical: criticalFlags.orderSubmitCritical,
      orderConfirmationCritical: criticalFlags.orderConfirmationCritical,
      giftTransferCritical: criticalFlags.giftTransferCritical,
      authRestoreCritical: !authReady || criticalFlags.authRestoreGate,
      permissionOnboardingCritical: criticalFlags.permissionGate,
      addressGateCritical: criticalFlags.addressGate,
      criticalDialogOpen: criticalFlags.criticalDialog || supportOpen,
    };
    const surface = resolveDibaySurface(pathname, toResolveDibaySurfaceContext(criticalUi));
    return {
      pathname,
      surface,
      authReady,
      userId,
      isAppForeground: isForeground,
      isLandscape,
      incomingCall: call.incomingCall,
      activeCall: call.activeCall,
      nativeCallTransition: call.nativeCallTransition,
      paymentCritical: criticalFlags.paymentCritical,
      orderSubmitCritical: criticalFlags.orderSubmitCritical,
      orderConfirmationCritical: criticalFlags.orderConfirmationCritical,
      giftTransferCritical: criticalFlags.giftTransferCritical,
      authRestoreGate: !authReady || criticalFlags.authRestoreGate,
      permissionGate: criticalFlags.permissionGate,
      addressGate: criticalFlags.addressGate,
      criticalDialog: criticalFlags.criticalDialog || supportOpen,
      startupDeferred: !shellReady,
      storesLcpDeferred,
      appSessionId,
    };
  }, [
    pathname,
    authReady,
    userId,
    isForeground,
    isLandscape,
    call.incomingCall,
    call.activeCall,
    call.nativeCallTransition,
    criticalFlags,
    supportOpen,
    shellReady,
    storesLcpDeferred,
    appSessionId,
  ]);

  const eligible = isPopupRuntimeEligible(runtimeCtx);

  const [hostState, setHostState] = useState<PlatformPopupHostState>("IDLE");
  const [winner, setWinner] = useState<ResolveWinner | null>(null);
  const generationRef = useRef(0);
  const identityRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** After dismiss/suppress: block immediate next-campaign chain until surface changes. */
  const chainLockSurfaceRef = useRef<string | null>(null);
  const runtimeCtxRef = useRef(runtimeCtx);
  runtimeCtxRef.current = runtimeCtx;

  // Auth identity isolation
  useEffect(() => {
    const nextId = userId ?? `anon:${deviceKey}`;
    if (identityRef.current == null) {
      identityRef.current = nextId;
      return;
    }
    if (identityRef.current !== nextId) {
      identityRef.current = nextId;
      abortRef.current?.abort();
      chainLockSurfaceRef.current = null;
      setWinner(null);
      generationRef.current += 1;
      setHostState((s) => reducePlatformPopupHostState(s, { type: "INVALIDATE" }));
    }
  }, [userId, deviceKey]);

  // Background / landscape / critical → invalidate visible or defer
  useEffect(() => {
    if (eligible) {
      setHostState((s) => {
        if (s === "DEFERRED" || s === "INVALIDATED") {
          return reducePlatformPopupHostState(s, { type: "ELIGIBLE" });
        }
        return s;
      });
      return;
    }
    abortRef.current?.abort();
    setHostState((s) => {
      if (s === "VISIBLE" || s === "READY" || s === "RESOLVING") {
        setWinner(null);
        return reducePlatformPopupHostState(s, { type: "INVALIDATE" });
      }
      if (s === "DISMISSED" || s === "SUPPRESSED") return s;
      return reducePlatformPopupHostState(s, { type: "DEFER" });
    });
  }, [eligible]);

  // Clear dismiss chain lock only after leaving the surface where exposure ended
  useEffect(() => {
    if (
      chainLockSurfaceRef.current != null &&
      chainLockSurfaceRef.current !== runtimeCtx.surface
    ) {
      chainLockSurfaceRef.current = null;
      setHostState((s) =>
        s === "DISMISSED" || s === "SUPPRESSED"
          ? reducePlatformPopupHostState(s, { type: "RESET" })
          : s
      );
    }
  }, [runtimeCtx.surface]);

  const acceptWinner = useCallback(
    (candidate: ResolveWinner, generation: number, surfaceAtStart: string) => {
      const ctx = runtimeCtxRef.current;
      if (
        !canAcceptPlatformPopupWinner({
          requestGeneration: generation,
          currentGeneration: generationRef.current,
          surfaceAtRequest: surfaceAtStart,
          winnerSurface: candidate.surface,
          runtime: ctx,
          chainLockSurface: chainLockSurfaceRef.current,
        })
      ) {
        return;
      }
      if (!validateWinnerHref(candidate.href)) return;
      setWinner(candidate);
      setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_WINNER" }));
    },
    []
  );

  // Resolve on eligible transitions — event/state driven, no campaign polling loop
  useEffect(() => {
    if (!eligible) return;
    if (hostState === "VISIBLE" || hostState === "READY" || hostState === "RESOLVING") return;
    if (hostState === "DISMISSED" || hostState === "SUPPRESSED") return;
    if (chainLockSurfaceRef.current === runtimeCtx.surface) return;

    const generation = ++generationRef.current;
    const surfaceAtStart = runtimeCtx.surface;
    const pathnameAtStart = runtimeCtx.pathname;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_START" }));

    const q = new URLSearchParams({
      pathname: pathnameAtStart,
      sessionKey: appSessionId,
      deviceKey,
      generation: String(generation),
    });

    void fetch(`/api/platform-popup/resolve?${q.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          ok?: boolean;
          winner?: ResolveWinner | null;
          surface?: string;
          generation?: string;
          impression?: boolean;
        };
        // Hard contract: API must never claim impression
        if (json.impression) return;
        if (generation !== generationRef.current) return;
        if (runtimeCtxRef.current.surface !== surfaceAtStart) return;
        if (!isPopupRuntimeEligible(runtimeCtxRef.current)) return;
        if (!json.winner) {
          setWinner(null);
          setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_EMPTY" }));
          return;
        }
        acceptWinner(json.winner, generation, surfaceAtStart);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        if (generation !== generationRef.current) return;
        setWinner(null);
        setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_EMPTY" }));
      });

    return () => {
      controller.abort();
    };
  }, [
    eligible,
    hostState,
    runtimeCtx.pathname,
    runtimeCtx.surface,
    runtimeCtx.userId,
    appSessionId,
    deviceKey,
    acceptWinner,
  ]);

  // Promote READY → VISIBLE only when still eligible (presentation shell boundary)
  useEffect(() => {
    if (hostState !== "READY" || !winner) return;
    if (!eligible) return;
    setHostState((s) => reducePlatformPopupHostState(s, { type: "SHOW" }));
  }, [hostState, winner, eligible]);

  const suppress = useCallback(
    async (mode: "CLOSE" | "SESSION" | "TODAY" | "DURATION" | "CAMPAIGN") => {
      if (!winner) return;
      const campaignId = winner.campaignId;
      const surfaceAtDismiss = runtimeCtxRef.current.surface;
      chainLockSurfaceRef.current = surfaceAtDismiss;
      setWinner(null);
      setHostState((s) =>
        reducePlatformPopupHostState(s, {
          type: mode === "CLOSE" ? "DISMISS" : "SUPPRESS",
        })
      );
      generationRef.current += 1;
      abortRef.current?.abort();

      const res = await fetch("/api/platform-popup/suppress", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mode,
          sessionKey: appSessionId,
          deviceKey,
        }),
      });
      if (!res.ok) {
        // Fail-soft: chain lock already blocks immediate re-show; do not lie that write succeeded
        console.error("[GlobalPopupHost] suppress_write_failed", await res.text());
      }
    },
    [winner, appSessionId, deviceKey]
  );

  const showPresentation = mayMountPlatformPopupPresentation(hostState) && winner != null;

  return (
    <div
      data-platform-popup-host="global"
      data-host-state={hostState}
      data-eligible={eligible ? "1" : "0"}
      data-surface={runtimeCtx.surface}
      data-winner={winner?.campaignId ?? ""}
      hidden={!showPresentation}
    >
      {showPresentation && winner ? (
        <div
          role="dialog"
          aria-modal="true"
          data-platform-popup-presentation="cut2-lifecycle-boundary"
          data-campaign-id={winner.campaignId}
          data-creative-id={winner.creativeId}
          data-impression="0"
        >
          {/* CUT 2: lifecycle boundary only — final visual is CUT 3 */}
          <button type="button" data-platform-popup-dismiss="close" onClick={() => void suppress("CLOSE")}>
            close
          </button>
          <button
            type="button"
            data-platform-popup-dismiss="session"
            onClick={() => void suppress("SESSION")}
          >
            session
          </button>
          <button type="button" data-platform-popup-dismiss="today" onClick={() => void suppress("TODAY")}>
            today
          </button>
        </div>
      ) : null}
    </div>
  );
}
