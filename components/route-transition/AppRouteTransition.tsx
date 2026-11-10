"use client";

import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import {
  DELIVERY_STACK_SLIDE_MS,
  MAIN_SHELL_ROUTE_TRANSITION_MS,
  ROUTE_TRANSITION_ENTER_CLASSES,
  isMypageMotionKind,
  isMypageStackHeaderFixedKind,
  routeTransitionClassForKind,
  routeTransitionPushAxisForKind,
  type MainShellRoutePushAxis,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import { resolveMainShellPushDurationMs } from "@/lib/navigation/resolve-main-shell-push-duration-ms";
import { MYPAGE_MOTION_MS } from "@/lib/mypage/mypage-authority-contract";
import { useRouteTransitionKindRef } from "@/components/route-transition/useRouteTransitionDirection";
import {
  consumeMainShellPushEnterSession,
  mainShellPushEnterClassForAxis,
  mainShellPushFromClassForAxis,
} from "@/lib/navigation/main-shell-push-session";
import {
  applyNotificationDestinationEnterOnSurface,
  consumeNotificationDestinationEnterSession,
} from "@/lib/notifications/notification-destination-enter-session";
import { consumeMainShellPushAxisIntent, peekMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import { isStoreCommerceCartCheckoutPath } from "@/lib/stores/store-cart-page-layout";
import { deliveryConsumerStackDepth, isDeliveryConsumerStackPath } from "@/lib/stores/delivery-consumer-stack-slide";
import {
  captureMainShellSurfaceUnderlay,
  mountMainShellSurfaceUnderlay,
  type MainShellSurfaceUnderlayCapture,
} from "@/components/route-transition/main-shell-surface-underlay";
import { shouldUseMainShellHubFallbackEnter } from "@/components/route-transition/main-shell-hub-fallback-enter";
import { isMainTabKeepAliveHubPath } from "@/lib/layout/resolve-main-surface";
import { isTradeMarketHubPathname } from "@/lib/trade/tabs/trade-market-feed-href";
import {
  finalizeMainHubTransition,
  isMainHubTransitionGenerationActive,
  markMainHubTransitionEntering,
  markMainHubTransitionFirstFrame,
  peekMainHubTransition,
  registerMainHubTransitionSurfaceApplier,
  settleMainHubTransitionOnPathname,
  subscribeMainHubTransition,
  type MainHubTransitionSession,
} from "@/lib/navigation/main-hub-transition-authority";

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
  /**
   * @deprecated Temporary enter Feed/List panels are forbidden; always pass null for bottom tabs.
   */
  pendingPushNode?: ReactNode;
  /** `ConditionalAppShell` — push 호스트 flex 연장 */
  contentStretchClass?: string;
  /**
   * MAIN hub Header slot — rendered inside the single push surface
   * so Header+Body share ONE transform authority. BottomNav stays outside.
   */
  hubChromeHeader?: ReactNode;
};

type PushSession = {
  exiting: ReactNode;
  entering: ReactNode;
  axis: MainShellRoutePushAxis;
  animate: boolean;
  startedAt: number;
  targetPath?: string;
  durationMs: number;
};

type PushHandoff = {
  node: ReactNode;
  startedAt: number;
  targetPath?: string;
};

const PUSH_SURFACE_CLASSES = [
  "main-shell-push-surface-from-ltr",
  "main-shell-push-surface-from-rtl",
  "main-shell-push-surface-enter-ltr",
  "main-shell-push-surface-enter-rtl",
  "main-shell-push-surface-exit-ltr",
  "main-shell-push-surface-exit-rtl",
] as const;

const MAX_PENDING_PUSH_HOLD_MS = 12_000;
const PUSH_HANDOFF_NON_MESSENGER_FALLBACK_MS = 1_200;

/** Surface kind for MAIN hub intent transition (COVER abandoned — do not reuse "cover"). */
const MAIN_HUB_TRANSITION_KIND = "main-hub";

/**
 * Dual-panel temporary enter — DISABLED for bottom-nav / trade-primary.
 * Instant enter panels created a second Feed that remounted on push end.
 */
const MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set<string>();

function isKeepAliveHubRouteTransition(
  fromPath: string | null | undefined,
  toPath: string | null | undefined
): boolean {
  return isMainTabKeepAliveHubPath(fromPath) && isMainTabKeepAliveHubPath(toPath);
}

function stripTransitionClasses(el: HTMLDivElement | null, classes: readonly string[]) {
  if (!el) return;
  for (const c of classes) {
    el.classList.remove(c);
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizePathKeyForPush(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim() ?? "";
}

/**
 * Suppress fallback hub enter restart for the same dest within one transition window
 * (browser back / non-intent path changes only).
 */
let lastHubFallbackDestPath = "";
let lastHubFallbackStartedAt = 0;
const HUB_FALLBACK_RESTART_GUARD_MS = MAIN_SHELL_ROUTE_TRANSITION_MS + 80;

/**
 * 내정보 kind(X2) 전용 push 시간 — `MYPAGE_MOTION_MS`(300ms). 다른 kind 는 기존 계산 그대로.
 * `resolveMainShellPushDurationMs` 는 수정하지 않는다(거래 `/market` 250ms 규칙 보호).
 */
function mypageMotionPushDurationMs(kind: RouteTransitionEnterKind): number | null {
  if (!isMypageMotionKind(kind)) return null;
  return kind === "mypage-stack-back" || kind === "profile-edit-back" || kind === "address-platform-back"
    ? MYPAGE_MOTION_MS.back
    : MYPAGE_MOTION_MS.push;
}

/**
 * Hub-fallback surface(`main-shell-push-surface-enter-*`, CSS 440ms 고정) 에 내정보 kind 일 때만
 * `--main-shell-push-ms` + `data-mypage-stack-motion` 을 단다. 그 외 전환에서는 항상 제거 — 하단 탭·
 * 다른 도메인 hub 전환 시간은 불변(440ms).
 */
/** 배달 스택 이동 — `--main-shell-push-ms` + `data-delivery-stack-motion` (globals.css 가 길이만 바꿈). null = 제거 */
function setDeliveryStackMotionOnSurface(el: HTMLDivElement | null, durationMs: number | null) {
  if (!el) return;
  if (durationMs != null) {
    el.dataset.deliveryStackMotion = "1";
    el.style.setProperty("--delivery-stack-push-ms", `${durationMs}ms`);
    return;
  }
  delete el.dataset.deliveryStackMotion;
  el.style.removeProperty("--delivery-stack-push-ms");
}

/**
 * 배달 홈(`/stores`) ↔ 업종·메뉴 페이지·검색(깊이 1) — 한 surface 슬라이드라 나가는 화면 밑그림이 필요한 이동.
 * 목록 ↔ 매장은 `DeliveryPresentationShell` 이 두 층으로 직접 슬라이드하므로 제외.
 */
function needsDeliveryHomeSurfaceUnderlay(fromPath: string, toPath: string): boolean {
  const a = deliveryConsumerStackDepth(fromPath);
  const b = deliveryConsumerStackDepth(toPath);
  return (a === 0 && b === 1) || (a === 1 && b === 0);
}

/**
 * 경로가 바뀌는 커밋의 DOM 변경 **직전**(getSnapshotBeforeUpdate)에 나가는 surface 를 복제한다.
 * useLayoutEffect 는 이미 새 화면 DOM 이라 늦다.
 */
class SurfaceBeforeCommitSnapshot extends Component<{
  pathname: string;
  capture: (fromPath: string, toPath: string) => void;
  children: ReactNode;
}> {
  getSnapshotBeforeUpdate(prev: Readonly<{ pathname: string }>): null {
    if (prev.pathname !== this.props.pathname) this.props.capture(prev.pathname, this.props.pathname);
    return null;
  }
  componentDidUpdate(): void {}
  render() {
    return this.props.children;
  }
}

function setMypageStackMotionOnSurface(
  el: HTMLDivElement | null,
  durationMs: number | null,
  opts?: { headerFixed?: boolean }
) {
  if (!el) return;
  if (durationMs != null) {
    el.dataset.mypageStackMotion = "1";
    el.style.setProperty("--main-shell-push-ms", `${durationMs}ms`);
    /**
     * 내정보 스택 kind — 1단 헤더 고정, 본문만 슬라이드 (설계서 §12 「전환 중」).
     * CSS(`globals.css` `data-mypage-stack-header-fixed`)가 surface 대신 헤더 밖 자식만 translate.
     */
    if (opts?.headerFixed) el.dataset.mypageStackHeaderFixed = "1";
    else delete el.dataset.mypageStackHeaderFixed;
    return;
  }
  if (el.dataset.mypageStackHeaderFixed != null) {
    delete el.dataset.mypageStackHeaderFixed;
  }
  if (el.dataset.mypageStackMotion != null) {
    delete el.dataset.mypageStackMotion;
    el.style.removeProperty("--main-shell-push-ms");
  }
}

function forceMainHubSurfaceCleanup(el: HTMLDivElement | null) {
  if (!el) return;
  const pending = (el as HTMLElement & { __hubTransitionTimer?: number }).__hubTransitionTimer;
  if (pending != null) {
    window.clearTimeout(pending);
    delete (el as HTMLElement & { __hubTransitionTimer?: number }).__hubTransitionTimer;
  }
  stripTransitionClasses(el, PUSH_SURFACE_CLASSES);
  if (
    el.dataset.routeTransitionKind === MAIN_HUB_TRANSITION_KIND ||
    el.dataset.routeTransitionKind === "cover"
  ) {
    el.dataset.routeTransitionKind = "none";
  }
  delete el.dataset.mainHubTransitionFirstFrame;
  delete el.dataset.mainHubTransitionGeneration;
}

function ensureMainHubEnterCleanup(el: HTMLDivElement, generation: number | null) {
  if ((el as HTMLElement & { __hubTransitionTimer?: number }).__hubTransitionTimer != null) return;

  let cleaned = false;
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    const pending = (el as HTMLElement & { __hubTransitionTimer?: number }).__hubTransitionTimer;
    if (pending != null) {
      window.clearTimeout(pending);
      delete (el as HTMLElement & { __hubTransitionTimer?: number }).__hubTransitionTimer;
    }
    el.removeEventListener("transitionend", onEnd);
    stripTransitionClasses(el, PUSH_SURFACE_CLASSES);
    setMypageStackMotionOnSurface(el, null);
    if (
      el.dataset.routeTransitionKind === MAIN_HUB_TRANSITION_KIND ||
      el.dataset.routeTransitionKind === "cover"
    ) {
      el.dataset.routeTransitionKind = "none";
    }
    if (generation != null) {
      finalizeMainHubTransition(generation);
    }
  };

  const onEnd = (ev: TransitionEvent) => {
    if (ev.target !== el) return;
    if (ev.propertyName && ev.propertyName !== "transform") return;
    const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    if (elapsed < 120) return;
    if (generation != null && !isMainHubTransitionGenerationActive(generation)) {
      cleanup();
      return;
    }
    cleanup();
  };

  el.addEventListener("transitionend", onEnd);
  (el as HTMLElement & { __hubTransitionTimer?: number }).__hubTransitionTimer = window.setTimeout(
    cleanup,
    MAIN_SHELL_ROUTE_TRANSITION_MS + 48
  );
}

/**
 * Intent-first: arm the session at tap (transition_first_frame) but **keep the current surface on screen**.
 *
 * D-1 (Owner 승인 2026-11-10): 예전에는 여기서 from-* (translate 100%, transition 없음)을 붙여 헤더+본문 surface 를
 * 경로 확정까지 화면 밖에 두었다 → 새 경로 RSC 를 기다리는 동안 하단 탭만 남은 흰 화면
 * (Samsung 평소 0.3~0.7초, 배포 직후 문서 이동까지 약 2.5초 — 2026-11-10 실측·브라우저 프레임 계측).
 * 이제 이전 화면을 그대로 두고, 경로 확정(useLayoutEffect, 그리기 전) 때 `applyMainHubEnter` 가
 * from-* → reflow → enter 로 같은 슬라이드를 시작한다.
 */
function applyMainHubPendingExit(
  el: HTMLDivElement,
  session: MainHubTransitionSession
): void {
  if (prefersReducedMotion()) {
    forceMainHubSurfaceCleanup(el);
    finalizeMainHubTransition(session.generation);
    return;
  }
  forceMainHubSurfaceCleanup(el);
  setMypageStackMotionOnSurface(el, null);
  el.dataset.routeTransitionKind = MAIN_HUB_TRANSITION_KIND;
  el.dataset.routePushAxis = session.axis;
  el.dataset.mainHubTransitionGeneration = String(session.generation);
  el.dataset.mainHubTransitionFirstFrame = "1";
  markMainHubTransitionFirstFrame(session.generation);
}

/**
 * A 단계 (Owner 승인 2026-11-10, `docs/audit/app-tab-navigation-root-cause-design-2026-11-10.md` §1-A):
 * 하단 탭 허브→허브 이동은 슬라이드 없이 즉시 — 경로 확정 순간 표식만 정리하고 이동 세션을 끝낸다
 * (`prefers-reduced-motion` 경로와 같은 처리). 이전에는 화면 전체를 오른쪽 밖(100%)에 두었다가 0.44초 밀어 넣어
 * 그 사이 하단 탭만 남은 빈 화면이 보였다. 허브→상세·상세→허브·링크 이동 등 다른 연출은 그대로.
 */
function settleMainHubSwitchWithoutSlide(el: HTMLDivElement, generation: number): void {
  forceMainHubSurfaceCleanup(el);
  finalizeMainHubTransition(generation);
}

/**
 * 허브↔허브 뒤로가기 판정 — Navigation API `navigate` 이벤트의 `navigationType === "traverse"`.
 * popstate 는 이 앱 WebView 에서 화면 확정 **뒤**에 온다(실측 2026-11-10 Android WebView Chrome 156: traverse 15ms ·
 * 경로 확정 79ms · popstate 141ms) → 확정 전에 오는 traverse 로 판정한다 (Owner 「traverse 판정으로 교체」 2026-11-10).
 * Navigation API 가 없는 환경(일부 iOS WebView 등)은 판정 없음 = 기존 슬라이드 유지.
 */
const HUB_TRAVERSE_WINDOW_MS = 1500;
let lastTraverseAt = 0;
let traverseListenerInstalled = false;

type NavigateEventLike = Event & { navigationType?: string };

function installHubTraverseMarker(): void {
  if (traverseListenerInstalled || typeof window === "undefined") return;
  const nav = (window as unknown as { navigation?: EventTarget }).navigation;
  if (!nav || typeof nav.addEventListener !== "function") return;
  traverseListenerInstalled = true;
  nav.addEventListener("navigate", (event) => {
    if ((event as NavigateEventLike).navigationType === "traverse") {
      lastTraverseAt = performance.now();
    }
  });
}

/** 경로가 바뀔 때마다 1회 읽고 지운다 — 다음 이동으로 표시가 넘어가지 않게. */
function consumeRecentTraverse(): boolean {
  if (lastTraverseAt === 0) return false;
  const recent = performance.now() - lastTraverseAt <= HUB_TRAVERSE_WINDOW_MS;
  lastTraverseAt = 0;
  return recent;
}

/**
 * Pathname confirmed (or fallback start): run enter on the same surface — no second arm.
 */
function applyMainHubEnter(
  el: HTMLDivElement,
  axis: MainShellRoutePushAxis,
  generation: number | null
): void {
  if (prefersReducedMotion()) {
    forceMainHubSurfaceCleanup(el);
    if (generation != null) finalizeMainHubTransition(generation);
    return;
  }
  const fromClass = mainShellPushFromClassForAxis(axis);
  const enterClass = mainShellPushEnterClassForAxis(axis);

  if (el.classList.contains(enterClass) && el.dataset.routeTransitionKind === MAIN_HUB_TRANSITION_KIND) {
    if (generation != null) markMainHubTransitionEntering(generation);
    ensureMainHubEnterCleanup(el, generation);
    return;
  }

  if (!el.classList.contains(fromClass)) {
    stripTransitionClasses(el, PUSH_SURFACE_CLASSES);
    el.classList.add(fromClass);
    void el.offsetWidth;
  }
  el.classList.remove(fromClass);
  el.classList.add(enterClass);
  el.dataset.routeTransitionKind = MAIN_HUB_TRANSITION_KIND;
  el.dataset.routePushAxis = axis;
  if (generation != null) {
    el.dataset.mainHubTransitionGeneration = String(generation);
    markMainHubTransitionEntering(generation);
  }
  ensureMainHubEnterCleanup(el, generation);
}

/**
 * Non-intent hub path change (back/forward/programmatic): pathname may still START enter.
 * Intent-active generations must not double-start here.
 */
function beginHubFallbackEnter(
  el: HTMLDivElement,
  axis: MainShellRoutePushAxis,
  destPath: string
): (() => void) | undefined {
  if (prefersReducedMotion()) {
    forceMainHubSurfaceCleanup(el);
    return undefined;
  }

  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const dest = normalizePathKeyForPush(destPath).replace(/\/+$/, "") || "/";
  const enterClass = mainShellPushEnterClassForAxis(axis);
  const withinGuard =
    lastHubFallbackDestPath === dest && now - lastHubFallbackStartedAt < HUB_FALLBACK_RESTART_GUARD_MS;

  const transform = typeof window !== "undefined" ? window.getComputedStyle(el).transform : "none";
  const atRest =
    !transform ||
    transform === "none" ||
    transform.startsWith("matrix(1, 0, 0, 1") ||
    transform === "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)";

  if (withinGuard && !atRest && el.dataset.routeTransitionKind === MAIN_HUB_TRANSITION_KIND) {
    return undefined;
  }
  if (withinGuard && !atRest && el.classList.contains(enterClass)) {
    return undefined;
  }

  lastHubFallbackDestPath = dest;
  lastHubFallbackStartedAt = now;
  applyMainHubEnter(el, axis, null);
  return undefined;
}

function beginPushTrackAnimation(setPushSession: Dispatch<SetStateAction<PushSession | null>>) {
  return requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setPushSession((current) => (current ? { ...current, animate: true } : null));
    });
  });
}

function pushTargetReached(pathname: string | null | undefined, targetPath: string | undefined): boolean {
  if (!targetPath) return true;
  const current = normalizePathKeyForPush(pathname).replace(/\/+$/, "") || "/";
  const target = normalizePathKeyForPush(targetPath).replace(/\/+$/, "") || "/";
  return current === target || current.startsWith(`${target}/`);
}

/**
 * CONTRACT — 메인 5탭 push surface.
 * Hub↔hub (bottom-nav): dual-panel / InstantMainTabEnterPanel temporary Surface 금지.
 * Route children 가 단일 Surface — push session 으로 Feed 를 복제하지 않음.
 */
export function AppRouteTransition({
  children,
  overlay,
  pendingPushNode = null,
  contentStretchClass = "min-w-0",
  hubChromeHeader = null,
}: Props) {
  const pathname = usePathname();
  const mainShellChildScrollLocked = isStoreCommerceCartCheckoutPath(pathname);
  const kindRef = useRouteTransitionKindRef(pathname);
  const { pendingMenuIntent } = useLatestMenuNavigation();
  const subtleEnterRef = useRef<HTMLDivElement>(null);
  const pushSurfaceRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<{ pathname: string; node: ReactNode } | null>(null);
  const underlayCaptureRef = useRef<MainShellSurfaceUnderlayCapture | null>(null);
  const underlayRemoveRef = useRef<(() => void) | null>(null);
  const lastPushAxisRef = useRef<MainShellRoutePushAxis | null>(null);
  const pushSessionActiveRef = useRef(false);
  const appliedHubGenerationRef = useRef<number>(0);
  const traverseCheckedPathRef = useRef<string | null>(null);
  const [pushSession, setPushSession] = useState<PushSession | null>(null);
  const [pushHandoff, setPushHandoff] = useState<PushHandoff | null>(null);
  const refBag = useRef({ subtleEnterRef, pushSurfaceRef });
  refBag.current.subtleEnterRef = subtleEnterRef;
  refBag.current.pushSurfaceRef = pushSurfaceRef;

  useEffect(() => {
    installHubTraverseMarker();
  }, []);

  const bindPushSurfaceRef = (node: HTMLDivElement | null) => {
    refBag.current.subtleEnterRef.current = node;
    refBag.current.pushSurfaceRef.current = node;
  };

  /** Sync intent applier — same turn as BottomNav tap (not pathname). */
  useLayoutEffect(() => {
    const applyArmed = (session: MainHubTransitionSession) => {
      const el = pushSurfaceRef.current;
      if (!el || prefersReducedMotion()) return;
      if (session.phase !== "armed" && session.phase !== "pending_exit") return;
      if (appliedHubGenerationRef.current === session.generation && session.firstFrameAt != null) {
        return;
      }
      appliedHubGenerationRef.current = session.generation;
      applyMainHubPendingExit(el, session);
    };
    registerMainHubTransitionSurfaceApplier(applyArmed);
    const unsub = subscribeMainHubTransition(() => {
      const session = peekMainHubTransition();
      if (!session) return;
      applyArmed(session);
    });
    const existing = peekMainHubTransition();
    if (existing) applyArmed(existing);
    return () => {
      registerMainHubTransitionSurfaceApplier(null);
      unsub();
    };
  }, []);

  /** Intent id change — ensure pending_exit if applier missed. */
  useLayoutEffect(() => {
    const session = peekMainHubTransition();
    const el = pushSurfaceRef.current;
    if (!session || !el || prefersReducedMotion()) return;
    if (session.phase !== "armed" && session.phase !== "pending_exit") return;
    if (appliedHubGenerationRef.current === session.generation && session.firstFrameAt != null) {
      return;
    }
    appliedHubGenerationRef.current = session.generation;
    applyMainHubPendingExit(el, session);
  }, [pendingMenuIntent?.id]);

  /** `(stores)` ↔ `(main)` remount 후 sessionStorage 진입 push */
  useLayoutEffect(() => {
    const session = consumeMainShellPushEnterSession(pathname);
    const el = pushSurfaceRef.current;
    if (!session || !el || prefersReducedMotion()) return;

    const fromClass = mainShellPushFromClassForAxis(session.axis);
    const enterClass = mainShellPushEnterClassForAxis(session.axis);

    stripTransitionClasses(el, PUSH_SURFACE_CLASSES);
    setMypageStackMotionOnSurface(el, null);
    el.classList.add(fromClass);
    void el.offsetWidth;
    el.classList.remove(fromClass);
    el.classList.add(enterClass);

    const cleanup = () => {
      el.classList.remove(enterClass);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target !== el || e.propertyName !== "transform") return;
      el.removeEventListener("transitionend", onEnd);
      cleanup();
    };
    el.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(cleanup, MAIN_SHELL_ROUTE_TRANSITION_MS + 48);
    return () => {
      el.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  /** Notification Bell/Inbox row → destination: bottom→top 440ms (path-matched session). */
  useLayoutEffect(() => {
    const session = consumeNotificationDestinationEnterSession(pathname);
    if (!session) return;
    applyNotificationDestinationEnterOnSurface(pushSurfaceRef.current);
  }, [pathname]);

  useLayoutEffect(() => {
    pushSessionActiveRef.current = pushSession != null;
  }, [pushSession]);

  /**
   * Legacy dual-panel arm — only when MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES non-empty.
   * Bottom-nav hubs: keep-alive visibility; do not clone children into entering/exiting panels.
   */
  useLayoutEffect(() => {
    const intent = pendingMenuIntent;
    const axis = intent?.mainShellPushAxis;
    if (
      !intent ||
      intent.mainShellCrossGroupPush ||
      !MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES.has(intent.source) ||
      !axis ||
      prefersReducedMotion()
    )
      return;

    const currentPath = normalizePathKeyForPush(pathname);
    const targetPath = intent.pathname;
    if (!targetPath || currentPath === targetPath) return;
    if (isKeepAliveHubRouteTransition(currentPath, targetPath)) return;
    if (pushSessionActiveRef.current) return;

    const prev = renderedRef.current;
    if (!prev?.node) return;

    lastPushAxisRef.current = axis;
    pushSessionActiveRef.current = true;
    setPushHandoff(null);
    const durationMs = resolveMainShellPushDurationMs(intent, targetPath, {
      reducedMotion: prefersReducedMotion(),
    });
    setPushSession({
      exiting: prev.node,
      entering: pendingPushNode ?? children,
      axis,
      animate: false,
      startedAt: performance.now(),
      targetPath,
      durationMs,
    });
    const raf = beginPushTrackAnimation(setPushSession);
    return () => cancelAnimationFrame(raf);
  }, [
    children,
    pendingMenuIntent?.id,
    pendingMenuIntent?.mainShellCrossGroupPush,
    pendingMenuIntent?.mainShellPushAxis,
    pendingMenuIntent?.pathname,
    pendingPushNode,
    pathname,
  ]);

  /** 경로 변경마다 이전 밑그림은 즉시 걷고, 이번 커밋에서 들어오는 슬라이드가 시작됐을 때만 새로 깐다 */
  const mountUnderlayIfEntering = (
    el: HTMLDivElement,
    axis: MainShellRoutePushAxis,
    fromPath: string,
    toPath: string,
    durationMs: number | null
  ) => {
    const capture = underlayCaptureRef.current;
    underlayCaptureRef.current = null;
    if (!capture || capture.fromPath !== fromPath || capture.toPath !== toPath) return;
    if (!el.classList.contains(mainShellPushEnterClassForAxis(axis))) return;
    underlayRemoveRef.current = mountMainShellSurfaceUnderlay(
      el,
      capture,
      (durationMs ?? MAIN_SHELL_ROUTE_TRANSITION_MS) + 600
    );
  };

  /** 경로가 바뀌면(또는 언마운트) 이전 이동의 밑그림은 즉시 걷는다 — 아래 경로 effect 보다 먼저 실행 */
  useLayoutEffect(() => {
    underlayRemoveRef.current?.();
    underlayRemoveRef.current = null;
    return () => {
      underlayRemoveRef.current?.();
      underlayRemoveRef.current = null;
    };
  }, [pathname]);

  useLayoutEffect(() => {
    const pathKey = pathname ?? "";
    let prev = renderedRef.current;
    const el = subtleEnterRef.current;
    const activeHub = peekMainHubTransition();
    /** 이번 경로 변경이 뒤로/앞으로 가기(traverse)인지 — 경로가 바뀐 커밋에서만 1회 소비 */
    const traverseNav = traverseCheckedPathRef.current !== pathKey ? consumeRecentTraverse() : false;
    traverseCheckedPathRef.current = pathKey;

    /**
     * Stale renderedRef (e.g. still /philife while pathname is already /mypage) + new
     * bottom-nav intent → false path-change enter on the old screen. Sync without animating.
     */
    if (
      prev != null &&
      prev.pathname !== pathKey &&
      pendingMenuIntent?.pathname &&
      pendingMenuIntent.pathname !== pathKey &&
      (pendingMenuIntent.source === "bottom-nav" || pendingMenuIntent.source === "trade-primary")
    ) {
      if (!activeHub || activeHub.phase === "done") {
        forceMainHubSurfaceCleanup(el);
      }
      renderedRef.current = { pathname: pathKey, node: children };
      prev = renderedRef.current;
    }

    if (prev != null && prev.pathname !== pathKey) {
      const kind: RouteTransitionEnterKind = kindRef.current;
      const axisFromIntent =
        pendingMenuIntent?.mainShellPushAxis ?? peekMainShellPushAxisIntent() ?? null;
      if (axisFromIntent) {
        lastPushAxisRef.current = axisFromIntent;
      }
      const pushAxis =
        axisFromIntent ?? lastPushAxisRef.current ?? routeTransitionPushAxisForKind(kind);
      const enterClass = routeTransitionClassForKind(kind);
      /**
       * 재감사 F4 (2026-10-30) — 배달 소비자 스택(홈·업종·매장·메뉴 상세·장바구니) 안 이동은
       * 목록↔매장과 같은 0.14초. 다른 탭 전환(440ms)·내정보(300ms)는 그대로.
       */
      const deliveryStackMs =
        isDeliveryConsumerStackPath(prev.pathname) && isDeliveryConsumerStackPath(pathKey)
          ? DELIVERY_STACK_SLIDE_MS
          : null;
      setDeliveryStackMotionOnSurface(el, deliveryStackMs);

      const hubKeepAliveTransition =
        isKeepAliveHubRouteTransition(prev.pathname, pathKey) ||
        pendingMenuIntent?.source === "bottom-nav" ||
        pendingMenuIntent?.source === "trade-primary";

      /** Hub: intent session settles here — do NOT restart enter for active generation. */
      if (hubKeepAliveTransition) {
        /**
         * 거래 1차 탭: 같은 `/market` 허브 안 카테고리 전환은 커뮤니티 topic 과 같이
         * 셸 슬라이드 없이 children 만 교체.
         */
        const skipTradeCategoryEnter =
          pendingMenuIntent?.source === "trade-primary" &&
          isTradeMarketHubPathname(prev.pathname) &&
          isTradeMarketHubPathname(pathKey);

        const hubAxis: MainShellRoutePushAxis =
          axisFromIntent ??
          lastPushAxisRef.current ??
          (pushAxis === "rtl" || pushAxis === "ltr" ? pushAxis : null) ??
          "rtl";
        lastPushAxisRef.current = null;
        pushSessionActiveRef.current = false;
        setPushSession(null);
        setPushHandoff(null);
        stripTransitionClasses(el, ROUTE_TRANSITION_ENTER_CLASSES);
        renderedRef.current = { pathname: pathKey, node: children };
        consumeMainShellPushAxisIntent(pathKey);

        if (skipTradeCategoryEnter) {
          forceMainHubSurfaceCleanup(el);
          return undefined;
        }

        if (el && !prefersReducedMotion()) {
          if (activeHub && isMainHubTransitionGenerationActive(activeHub.generation)) {
            const settle = settleMainHubTransitionOnPathname(activeHub.generation, pathKey);
            if (settle === "settled") {
              settleMainHubSwitchWithoutSlide(el, activeHub.generation);
              return undefined;
            }
            if (settle === "mismatch") {
              /**
               * 재감사(2026-11-10): 누른 탭과 다른 경로로 확정(탭 직후 뒤로가기·다른 링크) — 이 세션은 여기서 끝낸다.
               * 예전에는 return 만 해 세션이 종료되지 않아, 다음 하단 탭을 누를 때까지 뒤로/앞으로 허브 슬라이드가
               * 생략되고 표식(data-route-transition-kind 등)이 남았다. 끝낸 뒤 아래 비의도 허브 이동 경로로 처리한다.
               */
              forceMainHubSurfaceCleanup(el);
              finalizeMainHubTransition(activeHub.generation);
            } else if (settle === "stale") {
              return undefined;
            }
          }
          /** Fallback: browser back / programmatic hub change without BottomNav intent. */
          setMypageStackMotionOnSurface(el, null);
          /** A 단계: 허브↔허브 뒤로가기(traverse)만 즉시 — 링크·상세에서 하단 탭 누름 등은 기존 슬라이드 유지. */
          if (isKeepAliveHubRouteTransition(prev.pathname, pathKey) && traverseNav) {
            forceMainHubSurfaceCleanup(el);
            return undefined;
          }
          return beginHubFallbackEnter(el, hubAxis, pathKey);
        }

        forceMainHubSurfaceCleanup(el);
        return undefined;
      }

      /**
       * Full push-surface fallback enter (Header+Body ONE surface, or cart/checkout
       * child-scroll lock without hub chrome). DO NOT couple eligibility to
       * `hubChromeHeader` alone — cart forward drops chrome but must keep
       * RIGHT→LEFT via beginHubFallbackEnter (not dual-panel remount).
       */
      if (
        pushAxis &&
        shouldUseMainShellHubFallbackEnter({
          hubChromeHeaderPresent: Boolean(hubChromeHeader),
          mainShellChildScrollLocked,
        }) &&
        !prefersReducedMotion() &&
        !pendingMenuIntent?.mainShellCrossGroupPush
      ) {
        lastPushAxisRef.current = null;
        pushSessionActiveRef.current = false;
        setPushSession(null);
        setPushHandoff(null);
        stripTransitionClasses(el, ROUTE_TRANSITION_ENTER_CLASSES);
        renderedRef.current = { pathname: pathKey, node: children };
        if (el) {
          /**
           * 내정보 하위 화면은 hubChromeHeader 가 있어 이 폴백을 탄다 — 내정보 kind 만 300ms.
           * 내정보 스택 kind 는 헤더 고정 + 본문만 슬라이드(제목·아이콘은 같은 커밋에서 교체).
           */
          setMypageStackMotionOnSurface(el, mypageMotionPushDurationMs(kind), {
            headerFixed: Boolean(hubChromeHeader) && isMypageStackHeaderFixedKind(kind),
          });
          const cleanupEnter = beginHubFallbackEnter(el, pushAxis, pathKey);
          mountUnderlayIfEntering(el, pushAxis, prev.pathname, pathKey, deliveryStackMs);
          return cleanupEnter;
        }
        return undefined;
      }

      if (pushAxis && !prefersReducedMotion() && !pendingMenuIntent?.mainShellCrossGroupPush) {
        if (pushSessionActiveRef.current) {
          renderedRef.current = { pathname: pathKey, node: children };
          if (el?.dataset) {
            el.dataset.routeTransitionKind = kind;
            el.dataset.routePushAxis = pushAxis;
          }
          return;
        }

        setPushHandoff(null);
        const durationMs =
          deliveryStackMs ??
          mypageMotionPushDurationMs(kind) ??
          resolveMainShellPushDurationMs(pendingMenuIntent, pathKey, {
            reducedMotion: prefersReducedMotion(),
          });
        setPushSession({
          exiting: prev.node,
          entering: pendingPushNode ?? children,
          axis: pushAxis,
          animate: false,
          startedAt: performance.now(),
          targetPath: pathKey,
          durationMs,
        });
        pushSessionActiveRef.current = true;
        renderedRef.current = { pathname: pathKey, node: children };

        const raf = beginPushTrackAnimation(setPushSession);

        if (el?.dataset) {
          el.dataset.routeTransitionKind = kind;
          el.dataset.routePushAxis = pushAxis;
        }

        return () => cancelAnimationFrame(raf);
      }

      lastPushAxisRef.current = null;
      pushSessionActiveRef.current = false;
      setPushSession(null);
      stripTransitionClasses(el, ROUTE_TRANSITION_ENTER_CLASSES);
      try {
        el?.getAnimations().forEach((a) => a.cancel());
      } catch {
        /* ignore */
      }

      if (el?.dataset) {
        el.dataset.routeTransitionKind = kind;
      }

      if (enterClass) {
        void el?.offsetWidth;
        const raf = requestAnimationFrame(() => {
          subtleEnterRef.current?.classList.add(enterClass);
        });
        renderedRef.current = { pathname: pathKey, node: children };
        return () => cancelAnimationFrame(raf);
      }
    } else if (prev == null) {
      /**
       * Remount mid-hub-nav: if intent session armed, apply pending_exit / enter;
       * else recover fallback enter from axis intent.
       */
      const active = peekMainHubTransition();
      if (el && active && isMainHubTransitionGenerationActive(active.generation) && !prefersReducedMotion()) {
        if (active.firstFrameAt == null) {
          appliedHubGenerationRef.current = active.generation;
          applyMainHubPendingExit(el, active);
        }
        const settle = settleMainHubTransitionOnPathname(active.generation, pathKey);
        if (settle === "settled") {
          settleMainHubSwitchWithoutSlide(el, active.generation);
        }
        renderedRef.current = { pathname: pathKey, node: children };
        return undefined;
      }
      const axisFromIntent =
        pendingMenuIntent?.mainShellPushAxis ?? peekMainShellPushAxisIntent() ?? null;
      const recoverAxis: MainShellRoutePushAxis | null =
        axisFromIntent ??
        (pendingMenuIntent?.source === "bottom-nav" || pendingMenuIntent?.source === "trade-primary"
          ? "rtl"
          : null);
      if (
        el &&
        recoverAxis &&
        isMainTabKeepAliveHubPath(pathKey) &&
        !prefersReducedMotion()
      ) {
        consumeMainShellPushAxisIntent(pathKey);
        renderedRef.current = { pathname: pathKey, node: children };
        setMypageStackMotionOnSurface(el, null);
        return beginHubFallbackEnter(el, recoverAxis, pathKey);
      }
      if (el?.dataset) {
        el.dataset.routeTransitionKind = "none";
      }
    } else if (activeHub && isMainHubTransitionGenerationActive(activeHub.generation) && el) {
      /** Same pathname render while intent pending — still apply first frame if missed. */
      if (activeHub.firstFrameAt == null && (activeHub.phase === "armed" || activeHub.phase === "pending_exit")) {
        appliedHubGenerationRef.current = activeHub.generation;
        applyMainHubPendingExit(el, activeHub);
      }
      const settle = settleMainHubTransitionOnPathname(activeHub.generation, pathKey);
      if (settle === "settled" && activeHub.phase !== "done") {
        settleMainHubSwitchWithoutSlide(el, activeHub.generation);
      }
    }

    renderedRef.current = { pathname: pathKey, node: children };
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kindRef: pathname 과 같은 커밋에서 useRouteTransitionKindRef 가 갱신
  }, [
    pathname,
    children,
    pendingMenuIntent?.mainShellCrossGroupPush,
    pendingMenuIntent?.mainShellPushAxis,
    pendingMenuIntent?.id,
    pendingMenuIntent?.pathname,
    pendingMenuIntent?.source,
    pendingPushNode,
  ]);

  useLayoutEffect(() => {
    if (!pushSession?.animate) return;
    const durationMs = pushSession.durationMs ?? MAIN_SHELL_ROUTE_TRANSITION_MS;
    const timer = window.setTimeout(() => {
      if (!pushTargetReached(pathname, pushSession.targetPath)) return;
      if (pushSession.entering) {
        beginPushHandoffIfNeeded(pushSession.entering, pushSession.targetPath);
      }
      pushSessionActiveRef.current = false;
      setPushSession(null);
      lastPushAxisRef.current = null;
    }, durationMs + 64);
    return () => window.clearTimeout(timer);
  }, [pathname, pushSession?.animate, pushSession?.durationMs, pushSession?.targetPath]);

  useLayoutEffect(() => {
    /** DO NOT finish push while animate:false (hold/pending enter). */
    if (!pushSession?.animate) return;
    if (!pushSession?.targetPath) return;
    if (!pushTargetReached(pathname, pushSession.targetPath)) return;
    const durationMs = pushSession.durationMs ?? MAIN_SHELL_ROUTE_TRANSITION_MS;
    const elapsed = performance.now() - pushSession.startedAt;
    const remaining = Math.max(40, durationMs + 64 - elapsed);
    const timer = window.setTimeout(() => {
      if (pushSession.entering) {
        beginPushHandoffIfNeeded(pushSession.entering, pushSession.targetPath);
      }
      pushSessionActiveRef.current = false;
      setPushSession(null);
      lastPushAxisRef.current = null;
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [
    pathname,
    pushSession?.animate,
    pushSession?.durationMs,
    pushSession?.startedAt,
    pushSession?.targetPath,
  ]);

  useLayoutEffect(() => {
    if (!pushSession?.targetPath) return;
    const timer = window.setTimeout(() => {
      pushSessionActiveRef.current = false;
      setPushSession(null);
      lastPushAxisRef.current = null;
    }, MAX_PENDING_PUSH_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [pushSession?.startedAt, pushSession?.targetPath]);

  const finishPushSession = () => {
    if (!pushTargetReached(pathname, pushSession?.targetPath)) return;
    if (pushSession?.entering) {
      beginPushHandoffIfNeeded(pushSession.entering, pushSession.targetPath);
    }
    pushSessionActiveRef.current = false;
    setPushSession(null);
    lastPushAxisRef.current = null;
  };

  function isMessengerHandoffTarget(targetPath: string | undefined): boolean {
    const key = normalizePathKeyForPush(targetPath).replace(/\/+$/, "") || "/";
    return key === "/community-messenger" || key.startsWith("/community-messenger/");
  }

  /** 슬라이드 종료 후 overlay — RSC 미도착 시에만 pending 패널 유지, 도착 즉시 children 노출 */
  function beginPushHandoffIfNeeded(entering: ReactNode, targetPath: string | undefined) {
    if (isMessengerHandoffTarget(targetPath) || !pushTargetReached(pathname, targetPath)) {
      setPushHandoff({
        node: entering,
        startedAt: performance.now(),
        targetPath,
      });
    }
  }

  useLayoutEffect(() => {
    if (!pushHandoff) return;

    const startedAt = pushHandoff.startedAt;
    const clearHandoff = () => {
      setPushHandoff((current) => (current?.startedAt === startedAt ? null : current));
    };

    if (!isMessengerHandoffTarget(pushHandoff.targetPath)) {
      if (pushTargetReached(pathname, pushHandoff.targetPath)) {
        clearHandoff();
        return;
      }
      const timer = window.setTimeout(clearHandoff, PUSH_HANDOFF_NON_MESSENGER_FALLBACK_MS);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const maxHoldMs = 2_400;
    let pollTimer: number | null = null;

    const schedulePoll = () => {
      if (cancelled) return;
      const elapsed = performance.now() - startedAt;
      if (elapsed >= maxHoldMs) {
        clearHandoff();
        return;
      }
      void import("@/lib/community-messenger/bootstrap-cache").then(({ peekBootstrapCache }) => {
        if (cancelled) return;
        if (peekBootstrapCache()) {
          clearHandoff();
          return;
        }
        pollTimer = window.setTimeout(schedulePoll, 48);
      });
    };

    schedulePoll();
    const maxTimer = window.setTimeout(clearHandoff, maxHoldMs);

    return () => {
      cancelled = true;
      window.clearTimeout(maxTimer);
      if (pollTimer != null) window.clearTimeout(pollTimer);
    };
  }, [pushHandoff, pathname]);

  const hostClass = [contentStretchClass, "relative isolate"].filter(Boolean).join(" ");

  const captureSurfaceBeforeCommit = (fromPath: string, toPath: string) => {
    underlayCaptureRef.current = null;
    const el = subtleEnterRef.current;
    if (!el || pushSessionActiveRef.current || prefersReducedMotion()) return;
    if (!needsDeliveryHomeSurfaceUnderlay(fromPath, toPath)) return;
    underlayCaptureRef.current = captureMainShellSurfaceUnderlay(el, fromPath, toPath);
  };

  const pushTrackClass = pushSession
    ? ["main-shell-push-track", pushSession.animate ? "main-shell-push-track--animate" : ""]
        .filter(Boolean)
        .join(" ")
    : "";

  const pushPanels =
    pushSession?.axis === "ltr" ? (
      <>
        <div className="main-shell-push-panel">{pushSession.entering}</div>
        <div className="main-shell-push-panel">{pushSession.exiting}</div>
      </>
    ) : pushSession?.axis === "rtl" ? (
      <>
        <div className="main-shell-push-panel">{pushSession.exiting}</div>
        <div className="main-shell-push-panel">{pushSession.entering}</div>
      </>
    ) : null;

  return (
    <SurfaceBeforeCommitSnapshot pathname={pathname ?? ""} capture={captureSurfaceBeforeCommit}>
    <div className={hostClass}>
      {pushSession ? (
        <div
          className="main-shell-push-viewport"
          data-route-transition-kind={kindRef.current}
          data-route-push-axis={pushSession.axis}
        >
          <div
            className={pushTrackClass}
            data-axis={pushSession.axis}
            style={
              {
                "--main-shell-push-ms": `${pushSession.durationMs ?? MAIN_SHELL_ROUTE_TRANSITION_MS}ms`,
              } as CSSProperties
            }
            onTransitionEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.propertyName !== "transform") return;
              finishPushSession();
            }}
          >
            {pushPanels}
          </div>
        </div>
      ) : (
        <div
          ref={bindPushSurfaceRef}
          data-main-shell-push-surface
          data-main-shell-child-scroll={mainShellChildScrollLocked ? "1" : undefined}
          data-main-hub-transition-surface={hubChromeHeader ? "1" : undefined}
          className={`main-shell-push-surface relative flex min-h-0 min-w-0 flex-1 flex-col${
            hubChromeHeader ? " main-hub-transition-surface" : ""
          }${mainShellChildScrollLocked ? " main-shell-push-surface--child-scroll" : ""}`}
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            stripTransitionClasses(subtleEnterRef.current, ROUTE_TRANSITION_ENTER_CLASSES);
          }}
        >
          {hubChromeHeader}
          {children}
        </div>
      )}
      {!pushSession && pushHandoff ? (
        <div
          className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-sam-app"
          data-main-shell-push-handoff="true"
        >
          {pushHandoff.node}
        </div>
      ) : null}
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-sam-app">{overlay}</div>
      ) : null}
    </div>
    </SurfaceBeforeCommitSnapshot>
  );
}
