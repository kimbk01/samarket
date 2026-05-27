"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { useRouteTransitionKindRef } from "@/components/route-transition/useRouteTransitionDirection";
import {
  consumeMainShellPushEnterSession,
  mainShellPushEnterClassForAxis,
  mainShellPushFromClassForAxis,
} from "@/lib/navigation/main-shell-push-session";

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
  /** `ConditionalAppShell` — push 호스트 flex 연장 */
  contentStretchClass?: string;
};

type PushSession = {
  exiting: ReactNode;
  axis: MainShellRoutePushAxis;
  animate: boolean;
};

const PUSH_SURFACE_CLASSES = [
  "main-shell-push-surface-from-ltr",
  "main-shell-push-surface-from-rtl",
  "main-shell-push-surface-enter-ltr",
  "main-shell-push-surface-enter-rtl",
  "main-shell-push-surface-exit-ltr",
  "main-shell-push-surface-exit-rtl",
] as const;

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

/**
 * CONTRACT — 메인 5탭 push surface.
 * same-group: dual-panel + `pendingMenuIntent.mainShellPushAxis`
 * cross-group: `main-shell-push-session` enter (Provider remount)
 */
export function AppRouteTransition({ children, overlay, contentStretchClass = "min-w-0" }: Props) {
  const pathname = usePathname();
  const kindRef = useRouteTransitionKindRef(pathname);
  const { pendingMenuIntent } = useLatestMenuNavigation();
  const subtleEnterRef = useRef<HTMLDivElement>(null);
  const pushSurfaceRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<{ pathname: string; node: ReactNode } | null>(null);
  const lastPushAxisRef = useRef<MainShellRoutePushAxis | null>(null);
  const [pushSession, setPushSession] = useState<PushSession | null>(null);
  const refBag = useRef({ subtleEnterRef, pushSurfaceRef });
  refBag.current.subtleEnterRef = subtleEnterRef;
  refBag.current.pushSurfaceRef = pushSurfaceRef;

  const bindPushSurfaceRef = (node: HTMLDivElement | null) => {
    refBag.current.subtleEnterRef.current = node;
    refBag.current.pushSurfaceRef.current = node;
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

  useLayoutEffect(() => {
    const pathKey = pathname ?? "";
    const prev = renderedRef.current;
    const el = subtleEnterRef.current;

    if (prev != null && prev.pathname !== pathKey) {
      const kind: RouteTransitionEnterKind = kindRef.current;
      const axisFromIntent = pendingMenuIntent?.mainShellPushAxis ?? null;
      if (axisFromIntent) {
        lastPushAxisRef.current = axisFromIntent;
      }
      const pushAxis =
        axisFromIntent ?? lastPushAxisRef.current ?? routeTransitionPushAxisForKind(kind);
      const enterClass = routeTransitionClassForKind(kind);

      if (pushAxis && !prefersReducedMotion()) {
        setPushSession({ exiting: prev.node, axis: pushAxis, animate: false });
        renderedRef.current = { pathname: pathKey, node: children };

        const raf = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPushSession((current) => (current ? { ...current, animate: true } : null));
          });
        });

        if (el?.dataset) {
          el.dataset.routeTransitionKind = kind;
          el.dataset.routePushAxis = pushAxis;
        }

        return () => cancelAnimationFrame(raf);
      }

      lastPushAxisRef.current = null;
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
  }, [pathname, children, pendingMenuIntent?.mainShellPushAxis, pendingMenuIntent?.id]);

  useLayoutEffect(() => {
    if (!pushSession?.animate) return;
    const timer = window.setTimeout(() => {
      setPushSession(null);
      lastPushAxisRef.current = null;
    }, MAIN_SHELL_ROUTE_TRANSITION_MS + 64);
    return () => window.clearTimeout(timer);
  }, [pushSession?.animate]);

  const finishPushSession = () => {
    setPushSession(null);
    lastPushAxisRef.current = null;
  };

  const hostClass = [contentStretchClass, "relative isolate"].filter(Boolean).join(" ");

  const pushTrackClass = pushSession
    ? ["main-shell-push-track", pushSession.animate ? "main-shell-push-track--animate" : ""]
        .filter(Boolean)
        .join(" ")
    : "";

  const pushPanels =
    pushSession?.axis === "ltr" ? (
      <>
        <div className="main-shell-push-panel">{children}</div>
        <div className="main-shell-push-panel">{pushSession.exiting}</div>
      </>
    ) : pushSession?.axis === "rtl" ? (
      <>
        <div className="main-shell-push-panel">{pushSession.exiting}</div>
        <div className="main-shell-push-panel">{children}</div>
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
      {overlay ? (
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-sam-app">{overlay}</div>
      ) : null}
    </div>
  );
}
