"use client";

import {
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
import { consumeMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import {
  armPathnameSingleSurfaceEnter,
  cancelPathnameSingleSurfaceEnterArm,
} from "@/lib/navigation/pathname-single-surface-enter-arm";
import { shouldArmMainDomainTruePush, isMainDomainCrossPush } from "@/lib/navigation/main-domain-cross-push";
import { consumeMainDomainCrossPushIntent } from "@/lib/navigation/main-domain-cross-push-intent-ref";
import { isMainTabKeepAliveHubPath } from "@/lib/layout/resolve-main-surface";

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
  /**
   * @deprecated Temporary enter Feed/List panels are forbidden; always pass null for bottom tabs.
   */
  pendingPushNode?: ReactNode;
  /** `ConditionalAppShell` — push 호스트 flex 연장 */
  contentStretchClass?: string;
};

/**
 * MAIN DOMAIN true push — previous snapshot + live route children in a stable current panel.
 * `liveChildren: true` → current panel renders props.children (no frozen entering clone / no Instant Feed).
 */
type PushSession = {
  previousNode: ReactNode;
  /** Legacy frozen entering only — unused while MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES empty */
  frozenEntering: ReactNode | null;
  liveChildren: boolean;
  axis: MainShellRoutePushAxis;
  animate: boolean;
  startedAt: number;
  targetPath?: string;
  durationMs: number;
  mode: "main-domain" | "legacy";
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

/**
 * Legacy Instant/temporary enter dual-panel sources — MUST stay empty.
 * MAIN DOMAIN true push is pathname-owned (previous snapshot + live children), not Instant Feed.
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
 * CONTRACT — MAIN DOMAIN bottom-nav true push.
 * - Cross-domain bottom-nav: previous surface retained + live next children on one track (RTL 440ms).
 * - DO NOT: InstantMainTabEnterPanel / frozen duplicate Feed as entering authority.
 * - Live route `children` stay on data-main-domain-current for the whole transition (remount guard).
 */
export function AppRouteTransition({
  children,
  overlay,
  pendingPushNode = null,
  contentStretchClass = "min-w-0",
}: Props) {
  const pathname = usePathname();
  const kindRef = useRouteTransitionKindRef(pathname);
  const { pendingMenuIntent } = useLatestMenuNavigation();
  const subtleEnterRef = useRef<HTMLDivElement>(null);
  const pushSurfaceRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<{ pathname: string; node: ReactNode } | null>(null);
  const lastPushAxisRef = useRef<MainShellRoutePushAxis | null>(null);
  const pushSessionActiveRef = useRef(false);
  const singleSurfaceEnterArmRef = useRef<{ pathKey: string; rafId: number } | null>(null);
  /** Pathname-owned animate arm — not cancelled by intent/children metadata reruns. */
  const domainPushAnimateRafRef = useRef<number | null>(null);
  const [pushSession, setPushSession] = useState<PushSession | null>(null);
  const [pushHandoff, setPushHandoff] = useState<PushHandoff | null>(null);
  const refBag = useRef({ subtleEnterRef, pushSurfaceRef });
  refBag.current.subtleEnterRef = subtleEnterRef;
  refBag.current.pushSurfaceRef = pushSurfaceRef;

  useLayoutEffect(() => {
    return () => {
      cancelPathnameSingleSurfaceEnterArm(singleSurfaceEnterArmRef);
      if (domainPushAnimateRafRef.current != null) {
        cancelAnimationFrame(domainPushAnimateRafRef.current);
        domainPushAnimateRafRef.current = null;
      }
    };
  }, []);

  const bindPushSurfaceRef = (node: HTMLDivElement | null) => {
    refBag.current.subtleEnterRef.current = node;
    refBag.current.pushSurfaceRef.current = node;
  };

  const cancelDomainPushAnimateArm = () => {
    if (domainPushAnimateRafRef.current != null) {
      cancelAnimationFrame(domainPushAnimateRafRef.current);
      domainPushAnimateRafRef.current = null;
    }
  };

  const armDomainPushAnimate = () => {
    cancelDomainPushAnimateArm();
    domainPushAnimateRafRef.current = beginPushTrackAnimation(setPushSession);
  };

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
   * Legacy Instant dual-panel arm — only when MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES non-empty.
   * Kept for contract (Set must stay empty); MAIN DOMAIN push is pathname-owned below.
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
      previousNode: prev.node,
      frozenEntering: pendingPushNode ?? children,
      liveChildren: false,
      axis,
      animate: false,
      startedAt: performance.now(),
      targetPath,
      durationMs,
      mode: "legacy",
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
    const prev = renderedRef.current;
    const el = subtleEnterRef.current;

    if (prev != null && prev.pathname !== pathKey) {
      cancelPathnameSingleSurfaceEnterArm(singleSurfaceEnterArmRef);
      cancelDomainPushAnimateArm();

      const kind: RouteTransitionEnterKind = kindRef.current;
      const axisFromIntent =
        pendingMenuIntent?.mainShellPushAxis ?? consumeMainShellPushAxisIntent(pathKey) ?? null;
      if (axisFromIntent) {
        lastPushAxisRef.current = axisFromIntent;
      }
      const pushAxis =
        axisFromIntent ?? lastPushAxisRef.current ?? routeTransitionPushAxisForKind(kind);
      const enterClass = routeTransitionClassForKind(kind);

      const reducedMotion = prefersReducedMotion();
      const crossPushIntent = consumeMainDomainCrossPushIntent();
      const armMainDomain =
        shouldArmMainDomainTruePush({
          fromPathname: prev.pathname,
          toPathname: pathKey,
          intentSource: pendingMenuIntent?.source,
          reducedMotion,
        }) ||
        (!reducedMotion &&
          crossPushIntent &&
          isMainDomainCrossPush(prev.pathname, pathKey));

      /**
       * MAIN DOMAIN true push — retain previous React node + live next children on one track.
       * Intent clear / children RSC must not tear down this session (pathname ownership).
       */
      if (armMainDomain) {
        const axis: MainShellRoutePushAxis = axisFromIntent ?? "rtl";
        lastPushAxisRef.current = axis;
        setPushHandoff(null);
        const durationMs = resolveMainShellPushDurationMs(pendingMenuIntent, pathKey, {
          reducedMotion,
        });
        pushSessionActiveRef.current = true;
        setPushSession({
          previousNode: prev.node,
          frozenEntering: null,
          liveChildren: true,
          axis,
          animate: false,
          startedAt: performance.now(),
          targetPath: pathKey,
          durationMs,
          mode: "main-domain",
        });
        renderedRef.current = { pathname: pathKey, node: children };
        armDomainPushAnimate();
        return undefined;
      }

      const hubKeepAliveTransition =
        isKeepAliveHubRouteTransition(prev.pathname, pathKey) ||
        pendingMenuIntent?.source === "bottom-nav" ||
        pendingMenuIntent?.source === "trade-primary";

      /**
       * Same-domain / non-cross bottom-nav: single-surface enter only (not MAIN DOMAIN true push).
       * ARM OWNERSHIP: pathname rAF must NOT be cancelled by intent/children effect cleanup.
       */
      if (hubKeepAliveTransition) {
        lastPushAxisRef.current = null;
        pushSessionActiveRef.current = false;
        setPushSession(null);
        setPushHandoff(null);
        stripTransitionClasses(el, ROUTE_TRANSITION_ENTER_CLASSES);
        stripTransitionClasses(el, PUSH_SURFACE_CLASSES);
        renderedRef.current = { pathname: pathKey, node: children };

        const axis: MainShellRoutePushAxis | null =
          axisFromIntent ??
          (pendingMenuIntent?.source === "bottom-nav" ? "rtl" : routeTransitionPushAxisForKind(kind));

        if (axis && !reducedMotion && el) {
          const hubEnterClass =
            axis === "rtl"
              ? "main-shell-route-enter-rtl-forward"
              : "main-shell-route-enter-ltr-forward";
          if (el.dataset) {
            el.dataset.routeTransitionKind = axis === "rtl" ? "rtl-forward" : "ltr-forward";
            el.dataset.routePushAxis = axis;
          }
          try {
            el.getAnimations().forEach((a) => a.cancel());
          } catch {
            /* ignore */
          }
          void el.offsetWidth;
          armPathnameSingleSurfaceEnter(singleSurfaceEnterArmRef, {
            pathKey,
            onFrame: () => {
              subtleEnterRef.current?.classList.add(hubEnterClass);
            },
          });
          return undefined;
        }

        if (el?.dataset) {
          el.dataset.routeTransitionKind = "none";
        }
        return undefined;
      }

      if (pushAxis && !reducedMotion && !pendingMenuIntent?.mainShellCrossGroupPush) {
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
          reducedMotion,
        });
        setPushSession({
          previousNode: prev.node,
          frozenEntering: pendingPushNode ?? children,
          liveChildren: false,
          axis: pushAxis,
          animate: false,
          startedAt: performance.now(),
          targetPath: pathKey,
          durationMs,
          mode: "legacy",
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
        armPathnameSingleSurfaceEnter(singleSurfaceEnterArmRef, {
          pathKey,
          onFrame: () => {
            subtleEnterRef.current?.classList.add(enterClass);
          },
        });
        renderedRef.current = { pathname: pathKey, node: children };
        return undefined;
      }
    } else if (prev == null && el?.dataset) {
      el.dataset.routeTransitionKind = "none";
    } else if (prev != null && prev.pathname === pathKey && pushSessionActiveRef.current) {
      /** RSC / children refresh during MAIN DOMAIN push — keep session, refresh live authority. */
      renderedRef.current = { pathname: pathKey, node: children };
      return undefined;
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
    pendingMenuIntent?.source,
    pendingPushNode,
  ]);

  useLayoutEffect(() => {
    if (!pushSession?.animate) return;
    const durationMs = pushSession.durationMs ?? MAIN_SHELL_ROUTE_TRANSITION_MS;
    const timer = window.setTimeout(() => {
      if (!pushTargetReached(pathname, pushSession.targetPath)) return;
      if (pushSession.frozenEntering && !pushSession.liveChildren) {
        beginPushHandoffIfNeeded(pushSession.frozenEntering, pushSession.targetPath);
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
      if (pushSession.frozenEntering && !pushSession.liveChildren) {
        beginPushHandoffIfNeeded(pushSession.frozenEntering, pushSession.targetPath);
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
    if (pushSession?.frozenEntering && !pushSession.liveChildren) {
      beginPushHandoffIfNeeded(pushSession.frozenEntering, pushSession.targetPath);
    }
    pushSessionActiveRef.current = false;
    setPushSession(null);
    lastPushAxisRef.current = null;
  };

  function isMessengerHandoffTarget(targetPath: string | undefined): boolean {
    const key = normalizePathKeyForPush(targetPath).replace(/\/+$/, "") || "/";
    return key === "/community-messenger" || key.startsWith("/community-messenger/");
  }

  /** 슬라이드 종료 후 overlay — legacy frozen entering only */
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

  const axis = pushSession?.axis ?? "rtl";
  const pushTrackClass = [
    "main-shell-push-track",
    pushSession?.animate ? "main-shell-push-track--animate" : "",
  ]
    .filter(Boolean)
    .join(" ");

  /**
   * Stable current-panel host: route `children` always mount here (idle + push).
   * Previous slot stays mounted (hidden when idle) so current panel index does not shift (remount guard).
   */
  const currentPanelNode =
    pushSession && !pushSession.liveChildren && pushSession.frozenEntering != null
      ? pushSession.frozenEntering
      : children;

  const previousPanel = (
    <div
      className="main-shell-push-panel"
      data-main-domain-previous={pushSession ? "true" : "false"}
      hidden={!pushSession}
      aria-hidden={!pushSession}
    >
      {pushSession?.previousNode ?? null}
    </div>
  );

  const currentPanel = (
    <div
      ref={bindPushSurfaceRef}
      data-main-shell-push-surface
      data-main-domain-current
      data-main-domain-next={pushSession ? "true" : undefined}
      className={
        pushSession
          ? "main-shell-push-panel"
          : "main-shell-push-panel main-shell-push-surface relative flex min-h-0 min-w-0 flex-1 flex-col"
      }
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        stripTransitionClasses(subtleEnterRef.current, ROUTE_TRANSITION_ENTER_CLASSES);
      }}
    >
      {currentPanelNode}
    </div>
  );

  /** Product default RTL: [previous | current]. LTR legacy: [current | previous]. */
  const trackChildren =
    axis === "ltr" ? (
      <>
        {currentPanel}
        {previousPanel}
      </>
    ) : (
      <>
        {previousPanel}
        {currentPanel}
      </>
    );

  return (
    <div className={hostClass}>
      <div
        className="main-shell-push-viewport"
        data-main-domain-transition={pushSession ? "running" : "idle"}
        data-main-domain-transition-mode={pushSession?.mode}
        data-route-transition-kind={pushSession ? kindRef.current : "none"}
        data-route-push-axis={pushSession?.axis}
      >
        <div
          className={pushTrackClass}
          data-axis={axis}
          data-main-domain-track-idle={pushSession ? "false" : "true"}
          style={
            pushSession
              ? ({
                  "--main-shell-push-ms": `${pushSession.durationMs ?? MAIN_SHELL_ROUTE_TRANSITION_MS}ms`,
                } as CSSProperties)
              : undefined
          }
          onTransitionEnd={(e) => {
            if (!pushSession) return;
            if (e.target !== e.currentTarget) return;
            if (e.propertyName !== "transform") return;
            finishPushSession();
          }}
        >
          {trackChildren}
        </div>
      </div>
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
