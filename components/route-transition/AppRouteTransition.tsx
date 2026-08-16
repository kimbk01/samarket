"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import { useLatestMenuNavigation } from "@/contexts/LatestMenuNavigationContext";
import {
  MAIN_SHELL_ROUTE_TRANSITION_MS,
  ROUTE_TRANSITION_ENTER_CLASSES,
  routeTransitionClassForKind,
  routeTransitionPushAxisForKind,
  type MainShellRoutePushAxis,
  type RouteTransitionEnterKind,
} from "@/components/route-transition/route-transition-config";
import { resolveMainShellPushDurationMs } from "@/lib/navigation/resolve-main-shell-push-duration-ms";
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
 * Intent-first: park surface at from-* immediately (transition_first_frame).
 * Destination children may still be old — off-screen until pathname settle → enter.
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
  const fromClass = mainShellPushFromClassForAxis(session.axis);
  forceMainHubSurfaceCleanup(el);
  el.classList.add(fromClass);
  el.dataset.routeTransitionKind = MAIN_HUB_TRANSITION_KIND;
  el.dataset.routePushAxis = session.axis;
  el.dataset.mainHubTransitionGeneration = String(session.generation);
  el.dataset.mainHubTransitionFirstFrame = "1";
  markMainHubTransitionFirstFrame(session.generation);
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
  const kindRef = useRouteTransitionKindRef(pathname);
  const { pendingMenuIntent } = useLatestMenuNavigation();
  const subtleEnterRef = useRef<HTMLDivElement>(null);
  const pushSurfaceRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<{ pathname: string; node: ReactNode } | null>(null);
  const lastPushAxisRef = useRef<MainShellRoutePushAxis | null>(null);
  const pushSessionActiveRef = useRef(false);
  const appliedHubGenerationRef = useRef<number>(0);
  const [pushSession, setPushSession] = useState<PushSession | null>(null);
  const [pushHandoff, setPushHandoff] = useState<PushHandoff | null>(null);
  const refBag = useRef({ subtleEnterRef, pushSurfaceRef });
  refBag.current.subtleEnterRef = subtleEnterRef;
  refBag.current.pushSurfaceRef = pushSurfaceRef;

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

  useLayoutEffect(() => {
    const pathKey = pathname ?? "";
    let prev = renderedRef.current;
    const el = subtleEnterRef.current;
    const activeHub = peekMainHubTransition();

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
              applyMainHubEnter(el, activeHub.axis, activeHub.generation);
              return undefined;
            }
            if (settle === "stale" || settle === "mismatch") {
              return undefined;
            }
          }
          /** Fallback: browser back / programmatic hub change without BottomNav intent. */
          return beginHubFallbackEnter(el, hubAxis, pathKey);
        }

        forceMainHubSurfaceCleanup(el);
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
        const durationMs = resolveMainShellPushDurationMs(pendingMenuIntent, pathKey, {
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
          applyMainHubEnter(el, active.axis, active.generation);
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
        applyMainHubEnter(el, activeHub.axis, activeHub.generation);
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
  }, [pathname, pushSession?.durationMs, pushSession?.startedAt, pushSession?.targetPath]);

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
          data-main-hub-transition-surface={hubChromeHeader ? "1" : undefined}
          className={`main-shell-push-surface relative flex min-h-0 min-w-0 flex-1 flex-col${
            hubChromeHeader ? " main-hub-transition-surface" : ""
          }`}
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
  );
}
