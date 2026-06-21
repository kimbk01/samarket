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
import { consumeMainShellPushAxisIntent } from "@/lib/navigation/main-shell-push-axis-intent-ref";
import { registerMainShellPushSessionAbort } from "@/lib/navigation/main-shell-push-session-bridge";

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
  /** 하단 탭 확인 직후 RSC 완료 전에도 들어오는 패널로 사용할 경량 셸 */
  pendingPushNode?: ReactNode;
  /** `ConditionalAppShell` — push 호스트 flex 연장 */
  contentStretchClass?: string;
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

/** `beginMenuNavigation` 직후 dual-panel(440ms) — RSC 전 경량 셸을 들어오는 패널로 유지 */
const MAIN_SHELL_DUAL_PANEL_INTENT_SOURCES = new Set(["bottom-nav", "trade-primary"]);

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
 * CONTRACT — 메인 5탭 push surface.
 * same/cross-group: `beginMenuNavigation` 직후 dual-panel(440ms)을 시작하고,
 * RSC/pathname 이 늦어도 목적지 경량 셸을 들어오는 패널로 유지한다.
 * cross-group 은 remount 후 session enter 440ms 만 — dual-panel·즉시 exit 금지(이중 밀림).
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
  const [pushSession, setPushSession] = useState<PushSession | null>(null);
  const [pushHandoff, setPushHandoff] = useState<PushHandoff | null>(null);
  const refBag = useRef({ subtleEnterRef, pushSurfaceRef });
  refBag.current.subtleEnterRef = subtleEnterRef;
  refBag.current.pushSurfaceRef = pushSurfaceRef;

  const bindPushSurfaceRef = (node: HTMLDivElement | null) => {
    refBag.current.subtleEnterRef.current = node;
    refBag.current.pushSurfaceRef.current = node;
  };

  useLayoutEffect(() => {
    return registerMainShellPushSessionAbort(() => {
      pushSessionActiveRef.current = false;
      lastPushAxisRef.current = null;
      setPushSession(null);
      setPushHandoff(null);
    });
  }, []);

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

  useLayoutEffect(() => {
    pushSessionActiveRef.current = pushSession != null;
  }, [pushSession]);

  /**
   * 하단 탭 커밋 — pathname/RSC 대기 없이 dual-panel push 를 즉시 시작.
   * 목적지 RSC 가 늦으면 `pendingPushNode` 를 들어오는 패널로 유지해 이전 화면 snapback 을 막는다.
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
    const prev = renderedRef.current;
    const el = subtleEnterRef.current;

    if (prev != null && prev.pathname !== pathKey) {
      const kind: RouteTransitionEnterKind = kindRef.current;
      const axisFromIntent =
        pendingMenuIntent?.mainShellPushAxis ?? consumeMainShellPushAxisIntent(pathKey) ?? null;
      if (axisFromIntent) {
        lastPushAxisRef.current = axisFromIntent;
      }
      const pushAxis =
        axisFromIntent ?? lastPushAxisRef.current ?? routeTransitionPushAxisForKind(kind);
      const enterClass = routeTransitionClassForKind(kind);

      if (pushAxis && !prefersReducedMotion() && !pendingMenuIntent?.mainShellCrossGroupPush) {
        if (pushSessionActiveRef.current) {
          renderedRef.current = { pathname: pathKey, node: children };
          /**
           * pathname/RSC 가 먼저 도착해도 들어오는 패널을 `children`(Suspense·스켈레톤)으로
           * 바꾸지 않는다 — 440ms 슬라이드 안에 CommunityFeedSkeleton 이 끼는 회귀 방지.
           * 최종 본문은 push 종료 후 단일 surface `children` 로 전환.
           */
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
    } else if (prev == null && el?.dataset) {
      el.dataset.routeTransitionKind = "none";
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
          className="main-shell-push-surface relative flex min-h-0 min-w-0 flex-1 flex-col"
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            stripTransitionClasses(subtleEnterRef.current, ROUTE_TRANSITION_ENTER_CLASSES);
          }}
        >
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
