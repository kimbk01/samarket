"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
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
import { resolveDibaySurface } from "@/lib/platform-popup/resolve-dibay-surface";
import { toResolveDibaySurfaceContext } from "@/lib/platform-popup/critical-ui-context";
import { validatePlatformPopupCta } from "@/lib/platform-popup/cta";
import { canAcceptPlatformPopupWinner } from "@/lib/platform-popup/popup-stale-guard";
import type { PlatformPopupPresentationWinner } from "@/lib/platform-popup/popup-presentation-types";
import { recordPlatformPopupEvent } from "@/lib/platform-popup/record-popup-event-client";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

type ResolveWinner = PlatformPopupPresentationWinner;

const SSR_CALL_RUNTIME_SNAPSHOT = {
  incomingCall: false,
  activeCall: false,
  nativeCallTransition: false,
} as const;

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
 * CUT 2 GlobalPopupHost — ONE mount in ConditionalAppShell (main) and AdminPlatformShell.
 * Same DibayPopupAd renderer. No Admin-only popup UI.
 */
export function GlobalPopupHost() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
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
    () => SSR_CALL_RUNTIME_SNAPSHOT
  );

  const storesLcpDeferred = useStoresHomeOverlayDeferUntilInput();
  const [shellReady, setShellReady] = useState(() => isAppShellReady());
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (shellReady) return;
    if (isAdminPath) {
      setShellReady(true);
      return;
    }
    return whenAppShellReady(() => setShellReady(true));
  }, [shellReady, isAdminPath]);

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
      startupDeferred: isAdminPath ? false : !shellReady,
      storesLcpDeferred: isAdminPath ? false : storesLcpDeferred,
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
    isAdminPath,
    storesLcpDeferred,
    appSessionId,
  ]);

  const eligible = isPopupRuntimeEligible(runtimeCtx);

  const [hostState, setHostState] = useState<PlatformPopupHostState>("IDLE");
  const [winner, setWinner] = useState<ResolveWinner | null>(null);
  const [exposureId, setExposureId] = useState<string | null>(null);
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
      if (!validateWinnerHref(candidate.cta.href)) return;
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

    // Do not abort on IDLE→RESOLVING re-run — generation + surface guards handle staleness.
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
    setExposureId(`${winner.campaignId}:${winner.creativeId}:${generationRef.current}`);
    setHostState((s) => reducePlatformPopupHostState(s, { type: "SHOW" }));
  }, [hostState, winner, eligible]);

  const invalidateVisible = useCallback(() => {
    setWinner(null);
    setExposureId(null);
    generationRef.current += 1;
    abortRef.current?.abort();
    setHostState((s) => reducePlatformPopupHostState(s, { type: "INVALIDATE" }));
  }, []);

  const suppress = useCallback(
    async (mode: PlatformPopupSuppressionMode) => {
      if (!winner) return;
      const campaignId = winner.campaignId;
      const creativeId = winner.creativeId;
      const surfaceAtDismiss = runtimeCtxRef.current.surface;
      const currentExposure = exposureId;
      chainLockSurfaceRef.current = surfaceAtDismiss;
      setWinner(null);
      setExposureId(null);
      setHostState((s) =>
        reducePlatformPopupHostState(s, {
          type: mode === "CLOSE" ? "DISMISS" : "SUPPRESS",
        })
      );
      generationRef.current += 1;
      abortRef.current?.abort();

      if (currentExposure) {
        void recordPlatformPopupEvent({
          campaignId,
          creativeId,
          surface: winner.surface,
          eventType: mode === "CLOSE" ? "dismiss" : "suppress",
          source: "dismiss_handler",
          exposureId: currentExposure,
          deviceKey,
          meta: { mode },
        });
      }

      const res = await fetch("/api/platform-popup/suppress", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          mode,
          sessionKey: appSessionId,
          deviceKey,
          durationSeconds: mode === "DURATION" ? winner.suppressionDurationSeconds : undefined,
        }),
      });
      if (!res.ok) {
        console.error("[GlobalPopupHost] suppress_write_failed", await res.text());
      }
    },
    [winner, appSessionId, deviceKey, exposureId]
  );

  const handleClose = useCallback(() => {
    void suppress("CLOSE");
  }, [suppress]);

  const handleSuppress = useCallback(
    (mode: PlatformPopupSuppressionMode) => {
      void suppress(mode);
    },
    [suppress]
  );

  const handleCta = useCallback(() => {
    if (!winner || !exposureId) return;
    const href = winner.cta.href.trim();
    if (!validateWinnerHref(href)) return;

    void recordPlatformPopupEvent({
      campaignId: winner.campaignId,
      creativeId: winner.creativeId,
      surface: winner.surface,
      eventType: "click",
      source: "click_handler",
      exposureId,
      deviceKey,
    });

    if (href.startsWith("/")) {
      router.push(href);
      void recordPlatformPopupEvent({
        campaignId: winner.campaignId,
        creativeId: winner.creativeId,
        surface: winner.surface,
        eventType: "landing_success",
        source: "click_handler",
        exposureId,
        deviceKey,
        meta: { href },
      });
      handleClose();
      return;
    }

    try {
      window.location.assign(href);
      void recordPlatformPopupEvent({
        campaignId: winner.campaignId,
        creativeId: winner.creativeId,
        surface: winner.surface,
        eventType: "landing_success",
        source: "click_handler",
        exposureId,
        deviceKey,
        meta: { href },
      });
      handleClose();
    } catch {
      void recordPlatformPopupEvent({
        campaignId: winner.campaignId,
        creativeId: winner.creativeId,
        surface: winner.surface,
        eventType: "landing_failure",
        source: "click_handler",
        exposureId,
        deviceKey,
        meta: { href },
      });
    }
  }, [winner, exposureId, router, handleClose, deviceKey]);

  const handleRenderComplete = useCallback(() => {
    if (!winner || !exposureId) return;
    void recordPlatformPopupEvent({
      campaignId: winner.campaignId,
      creativeId: winner.creativeId,
      surface: winner.surface,
      eventType: "impression",
      source: "renderer",
      exposureId,
      deviceKey,
    });
  }, [winner, exposureId, deviceKey]);

  const handleImageError = useCallback(() => {
    invalidateVisible();
  }, [invalidateVisible]);

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
      {showPresentation && winner && exposureId ? (
        <DibayPopupAd
          campaignId={winner.campaignId}
          surface={winner.surface}
          creative={winner.creative}
          cta={winner.cta}
          suppressionOptions={winner.suppressionOptions}
          exposureId={exposureId}
          onClose={handleClose}
          onSuppress={handleSuppress}
          onCta={handleCta}
          onRenderComplete={handleRenderComplete}
          onImageError={handleImageError}
        />
      ) : null}
    </div>
  );
}
