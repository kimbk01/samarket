"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { ensureClientInstanceId } from "@/lib/auth/client-instance-id";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { isAppShellReady, whenAppShellReady } from "@/lib/startup/startup-metrics";
import { isSupportModalOpen, subscribeSupportModalState } from "@/lib/support/support-modal-controller";
import { readNonAdOpenOverlayCount, subscribeOpenOverlays } from "@/lib/ui/open-overlay-registry";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";
import {
  addPlatformPopupSessionBlockedCampaign,
  clearPlatformPopupSessionBlockedCampaigns,
  decidePlatformPopupIdentity,
  getOrCreatePlatformPopupAppSessionId,
  isPlatformPopupSessionBlockedCampaign,
  listPlatformPopupSessionBlockedCampaigns,
} from "@/lib/platform-popup/popup-app-session";
import { recordPromotionContentVisitClient } from "@/lib/platform-promotion-lifecycle/client-record-content-visit";
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
import { fetchPlatformPopupResolveDeduped } from "@/lib/platform-popup/fetch-platform-popup-resolve-client";
import { frequencyModeToDismissSuppressMode } from "@/lib/platform-popup/dismiss-ssot";
import { notifyDestinationOpenFailed, openDestination } from "@/lib/destination/open-destination";
import { parseDestinationHref } from "@/lib/destination/destination-contract";
import { waitPlatformPopupImageReady } from "@/lib/platform-popup/popup-image-ready";

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
  /** G-8: 확인창·바텀시트 등 광고가 아닌 오버레이가 열려 있으면 critical dialog 로 보류 */
  const otherOverlayOpen =
    useSyncExternalStore(subscribeOpenOverlays, readNonAdOpenOverlayCount, () => 0) > 0;
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
      criticalDialogOpen: criticalFlags.criticalDialog || supportOpen || otherOverlayOpen,
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
      criticalDialog: criticalFlags.criticalDialog || supportOpen || otherOverlayOpen,
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
    otherOverlayOpen,
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
  /**
   * 연속 노출 잠금은 **경로 기준 화면**으로만 푼다. 확인창·통화 등으로 surface 가 잠깐
   * ORDER_CRITICAL/CALL 로 바뀌었다 돌아와도 잠금이 풀리지 않게 한다 (G-8 과 함께 정정).
   */
  const navSurface = useMemo(() => resolveDibaySurface(pathname), [pathname]);
  const navSurfaceRef = useRef(navSurface);
  navSurfaceRef.current = navSurface;

  // Auth identity isolation
  useEffect(() => {
    /**
     * 광고 최종 점검 P2: 로그인 확인 중(`checking`)은 판정하지 않는다 — 예전에는 새로고침 직후 확인 중을 `anon:` 으로
     * 잡았다가 회원으로 확인되면 계정 변경으로 보고 × 로 닫은 기록(sessionStorage, 계약 §6 「같은 앱 실행」)을 지웠다.
     */
    const decision = decidePlatformPopupIdentity({
      previous: identityRef.current,
      authReady,
      userId,
      deviceKey,
    });
    identityRef.current = decision.identity;
    if (decision.changed) {
      abortRef.current?.abort();
      chainLockSurfaceRef.current = null;
      clearPlatformPopupSessionBlockedCampaigns();
      setWinner(null);
      generationRef.current += 1;
      setHostState((s) => reducePlatformPopupHostState(s, { type: "INVALIDATE" }));
    }
  }, [authReady, userId, deviceKey]);

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
      // EMPTY 는 같은 경로에서 이미 「띄울 것 없음」 — 확인창이 열렸다 닫혀도 다시 조회하지 않는다 (G-8)
      if (s === "DISMISSED" || s === "SUPPRESSED" || s === "EMPTY") return s;
      return reducePlatformPopupHostState(s, { type: "DEFER" });
    });
  }, [eligible]);

  // Clear dismiss chain lock / empty settle only after leaving the surface where exposure ended
  useEffect(() => {
    if (
      chainLockSurfaceRef.current != null &&
      chainLockSurfaceRef.current !== navSurface
    ) {
      chainLockSurfaceRef.current = null;
      setHostState((s) =>
        s === "DISMISSED" || s === "SUPPRESSED"
          ? reducePlatformPopupHostState(s, { type: "RESET" })
          : s
      );
    }
  }, [navSurface]);

  // EMPTY is settled for this pathname/surface/user — reopen only when identity changes
  useEffect(() => {
    setHostState((s) =>
      s === "EMPTY" ? reducePlatformPopupHostState(s, { type: "RESET" }) : s
    );
  }, [runtimeCtx.pathname, navSurface, userId]);

  /**
   * 재감사 S-1 (P-a): 소재 이미지가 깨진 캠페인 — 이번 앱 실행 동안 resolve 에서 제외한다(다음 순위로 넘어감).
   * 예전에는 오류 → 무효 → 같은 1위 다시 조회 → 또 오류로 요청이 끝없이 반복됐다.
   */
  const brokenCreativeCampaignIdsRef = useRef<Set<string>>(new Set());

  /** @returns 받아들였으면 true (거부 = 이 경로에서 띄울 것 없음으로 정리) */
  const acceptWinner = useCallback(
    (candidate: ResolveWinner, generation: number, surfaceAtStart: string): boolean => {
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
        return false;
      }
      if (!validateWinnerHref(candidate.cta.href)) return false;
      setWinner(candidate);
      setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_WINNER" }));
      return true;
    },
    []
  );

  // Resolve on eligible transitions — event/state driven, no campaign polling loop
  useEffect(() => {
    if (!eligible) return;
    if (hostState === "VISIBLE" || hostState === "READY" || hostState === "RESOLVING") return;
    if (hostState === "DISMISSED" || hostState === "SUPPRESSED" || hostState === "EMPTY") return;
    if (chainLockSurfaceRef.current === runtimeCtx.surface) return;

    const generation = ++generationRef.current;
    const surfaceAtStart = runtimeCtx.surface;
    const pathnameAtStart = runtimeCtx.pathname;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_START" }));

    void fetchPlatformPopupResolveDeduped({
      pathname: pathnameAtStart,
      sessionKey: appSessionId,
      deviceKey,
      generation: String(generation),
      signal: controller.signal,
      excludeCampaignIds: [
        ...listPlatformPopupSessionBlockedCampaigns(),
        ...brokenCreativeCampaignIdsRef.current,
      ],
    })
      .then(({ json }) => {
        // Hard contract: API must never claim impression
        if (json.impression) return;
        if (generation !== generationRef.current) return;
        /**
         * 재감사 S-1 (P-b): 응답을 버릴 때도 RESOLVING 에 머물지 않는다 — 예전에는 조회 중 화면을 옮기면
         * RESOLVING 이 남아 그 실행 동안 팝업이 다시 조회되지 않았다. 화면이 바뀌었거나 조건이 안 맞으면 무효로 돌려
         * 지금 화면 기준으로 다시 판단하게 한다(조건이 안 맞으면 조회 effect 가 실행되지 않음).
         */
        if (runtimeCtxRef.current.surface !== surfaceAtStart || !isPopupRuntimeEligible(runtimeCtxRef.current)) {
          setWinner(null);
          setHostState((s) => (s === "RESOLVING" ? reducePlatformPopupHostState(s, { type: "INVALIDATE" }) : s));
          return;
        }
        const winnerId = json.winner ? (json.winner as ResolveWinner).campaignId : "";
        if (
          !json.winner ||
          isPlatformPopupSessionBlockedCampaign(winnerId) ||
          brokenCreativeCampaignIdsRef.current.has(winnerId)
        ) {
          setWinner(null);
          setHostState((s) => reducePlatformPopupHostState(s, { type: "RESOLVE_EMPTY" }));
          return;
        }
        // 받아들일 수 없는 1위(영역 불일치·연속 잠금·잘못된 CTA 주소) = 이 경로에서 띄울 것 없음 (같은 입력 재조회 반복 방지)
        if (!acceptWinner(json.winner as ResolveWinner, generation, surfaceAtStart)) {
          setWinner(null);
          setHostState((s) => (s === "RESOLVING" ? reducePlatformPopupHostState(s, { type: "RESOLVE_EMPTY" }) : s));
        }
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
  // D-27: 소재 이미지 디코드가 끝난 뒤에만 틀을 보인다. 실패 = 깨진 소재(이번 실행 제외), 3초 넘김 = 이번 앱 실행 건너뜀.
  useEffect(() => {
    if (hostState !== "READY" || !winner) return;
    if (!eligible) return;
    let cancelled = false;
    const campaignId = winner.campaignId;
    void waitPlatformPopupImageReady(winner.creative.imageUrl).then((result) => {
      if (cancelled) return;
      if (result === "ready") {
        setExposureId(`${winner.campaignId}:${winner.creativeId}:${generationRef.current}`);
        setHostState((s) => reducePlatformPopupHostState(s, { type: "SHOW" }));
        return;
      }
      if (result === "failed") brokenCreativeCampaignIdsRef.current.add(campaignId);
      else addPlatformPopupSessionBlockedCampaign(campaignId);
      setWinner(null);
      setExposureId(null);
      generationRef.current += 1;
      setHostState((s) => reducePlatformPopupHostState(s, { type: "INVALIDATE" }));
    });
    return () => {
      cancelled = true;
    };
  }, [hostState, winner, eligible]);

  const invalidateVisible = useCallback(() => {
    setWinner(null);
    setExposureId(null);
    generationRef.current += 1;
    abortRef.current?.abort();
    setHostState((s) => reducePlatformPopupHostState(s, { type: "INVALIDATE" }));
  }, []);

  /**
   * 노출을 끝낸다. `persist` 일 때만 서버에 기록한다:
   * - PU-31 · D-21 ①: CLOSE(× · close_only) 는 효과가 없는 닫기라 **요청 0** (DB 행 없음 · 세션 숨김만)
   * - PU-30: CTA 로 끝난 노출은 click → landing 만 남기고 dismiss·suppress 는 남기지 않는다(`persist: false`)
   */
  const suppress = useCallback(
    async (mode: PlatformPopupSuppressionMode, opts: { persist: boolean } = { persist: true }) => {
      if (!winner) return;
      const campaignId = winner.campaignId;
      const creativeId = winner.creativeId;
      const surfaceAtDismiss = navSurfaceRef.current;
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

      if (!opts.persist || mode === "CLOSE") return;

      if (currentExposure) {
        void recordPlatformPopupEvent({
          campaignId,
          creativeId,
          surface: winner.surface,
          eventType: "suppress",
          source: "dismiss_handler",
          exposureId: currentExposure,
          deviceKey,
          meta: { mode },
        });
      }

      // 기록 실패(429 요청 제한 포함)는 화면 동작에 영향 없음 — 이미 닫혔고 세션 숨김은 메모리에 있다
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
          // D-2: CAMPAIGN 숨김 = 본 판(소재 + 목적지) 기준 — 이미지·목적지를 바꾸면 다시 노출 (서버 후보 revision)
          campaignRevision: mode === "CAMPAIGN" ? winner.revision ?? creativeId : undefined,
        }),
      }).catch(() => null);
      if (res && !res.ok) {
        console.error("[GlobalPopupHost] suppress_write_failed", res.status);
      }
    },
    [winner, appSessionId, deviceKey, exposureId]
  );

  const handleClose = useCallback(() => {
    if (!winner) {
      void suppress("CLOSE");
      return;
    }
    /**
     * X / ESC / backdrop → frequency policy suppress (Owner FINAL) + 광고 감사 G-6: 이 앱 실행 동안 재노출 금지
     * (계약 §6 연속 노출 금지 · Google Play 「전면 광고 반복 노출」 금지 · Owner 「권장안대로 진행」 2026-11-03).
     * DB 숨김 행은 쓰지 않아 `close_only` 「빈도 숨김 없음」은 유지 — 앱을 새로 켜면 다시 뜬다.
     */
    addPlatformPopupSessionBlockedCampaign(winner.campaignId);
    void suppress(frequencyModeToDismissSuppressMode(winner.frequencyMode));
  }, [suppress, winner]);

  const handleSuppress = useCallback(
    (mode: PlatformPopupSuppressionMode) => {
      void suppress(mode);
    },
    [suppress]
  );

  /** 노출 1회당 CTA 처리 1회 — 연타로 click·landing 이 두 번 기록되지 않게(PTR R-1 과 같은 장치) */
  const ctaHandledExposureRef = useRef<string | null>(null);
  const handleCta = useCallback(() => {
    if (!winner || !exposureId) return;
    if (ctaHandledExposureRef.current === exposureId) return;
    const href = winner.cta.href.trim();
    if (!validateWinnerHref(href)) {
      // DS-9: 무반응 금지 — 팝업은 그대로 두고 안내
      notifyDestinationOpenFailed();
      return;
    }
    ctaHandledExposureRef.current = exposureId;

    // 광고 감사(범위 밖 발견 · 4단계): landing 기록은 click 기록이 끝난 뒤 — 같은 노출에서 순서가 뒤바뀌지 않게(PTR R-2 와 같음)
    const clickRecorded = recordPlatformPopupEvent({
      campaignId: winner.campaignId,
      creativeId: winner.creativeId,
      surface: winner.surface,
      eventType: "click",
      source: "click_handler",
      exposureId,
      deviceKey,
    }).catch(() => {});

    // CTA lifecycle: navigate then end exposure locally (re-entry prevention = session block).
    // Analytics: click → landing only (no dismiss·suppress rows · PU-30).
    // Cross-channel: same-Event content visit (session) — covers multi-campaign + close_only.
    // PU-30: CTA 로 끝나면 dismiss·suppress 를 기록하지 않는다 — 노출만 끝내고 이번 실행 숨김(메모리)만 둔다.
    // 「오늘 하루」·「다시 보지 않기」는 사용자가 고른 경우에만 서버 숨김이 생긴다.
    const dismissAfterCta = () => {
      void suppress(frequencyModeToDismissSuppressMode(winner.frequencyMode), { persist: false });
    };

    const parsed = parseDestinationHref(href);
    if (!parsed.ok) {
      // 재감사: 이동 못 하면 잠그지 않는다 — 팝업이 남은 채 CTA 가 다시 눌리지 않던 문제 · DS-9 안내
      ctaHandledExposureRef.current = null;
      notifyDestinationOpenFailed();
      return;
    }
    if (parsed.ref.kind !== "external_url") {
      recordPromotionContentVisitClient({ hrefOrEventId: href, sourceChannel: "POPUP" });
    }
    // EVT-04: internal / event → app router; external → in-app browser (never the app WebView).
    const opened = openDestination(parsed.ref, router);
    if (!opened) ctaHandledExposureRef.current = null;
    void clickRecorded.then(() =>
      recordPlatformPopupEvent({
        campaignId: winner.campaignId,
        creativeId: winner.creativeId,
        surface: winner.surface,
        eventType: opened ? "landing_success" : "landing_failure",
        source: "click_handler",
        exposureId,
        deviceKey,
        meta: { href },
      }).catch(() => {})
    );
    if (opened) {
      addPlatformPopupSessionBlockedCampaign(winner.campaignId);
      dismissAfterCta();
    }
  }, [winner, exposureId, router, suppress, deviceKey]);

  /** IMPRESSION only — never frequency suppress. */
  const handleImpression = useCallback(() => {
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
    // 재감사 S-1 (P-a): 깨진 소재 캠페인은 이번 실행 동안 제외 → 다음 순위 또는 없음 (같은 요청 반복 방지)
    if (winner?.campaignId) brokenCreativeCampaignIdsRef.current.add(winner.campaignId);
    invalidateVisible();
  }, [invalidateVisible, winner]);

  const showPresentation = mayMountPlatformPopupPresentation(hostState) && winner != null;

  /*
   * Android Back → same dismiss SSOT as X: DibayPopupAd renders inside DibayOverlayRoot with
   * onClose={handleClose}, so the overlay back stack (lib/ui/overlay-back-stack.ts, INAPP-07)
   * closes the popup when it is the top-most overlay. No second native listener here.
   */

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
          title={winner.title}
          body={winner.body}
          benefit={winner.benefit}
          suppressionOptions={winner.suppressionOptions}
          exposureId={exposureId}
          presentationType={winner.presentationType}
          onClose={handleClose}
          onSuppress={handleSuppress}
          onCta={handleCta}
          onImpression={handleImpression}
          onImageError={handleImageError}
        />
      ) : null}
    </div>
  );
}
