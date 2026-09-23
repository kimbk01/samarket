"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  MESSENGER_PILLAR_LIST_ENTER_MS,
  MESSENGER_PILLAR_LIST_EXIT_MS,
} from "@/lib/community-messenger/messenger-list-room-slide";

type Phase = "enter" | "idle" | "exit";

/**
 * Trade/Delivery PAGE_HIERARCHY shell — ONE visible page motion owner.
 * Forward: CSS enter RTL. Back: exit LTR then navigate (Tier1 backHref interception via dataset hook).
 *
 * AppRouteTransition is suppressed for these paths — do not reintroduce subtle.
 */
export function MessengerPillarHierarchyMotionShell({
  pillar,
  children,
}: {
  pillar: "trade" | "delivery";
  children: ReactNode;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("enter");
  const exitHrefRef = useRef<string | null>(null);
  const exitingRef = useRef(false);

  useEffect(() => {
    const t = window.setTimeout(() => setPhase((p) => (p === "enter" ? "idle" : p)), MESSENGER_PILLAR_LIST_ENTER_MS + 40);
    return () => window.clearTimeout(t);
  }, []);

  const finishExit = useCallback(() => {
    const href = exitHrefRef.current;
    exitHrefRef.current = null;
    exitingRef.current = false;
    if (href) {
      router.push(href);
      return;
    }
    router.back();
  }, [router]);

  useEffect(() => {
    if (phase !== "exit") return;
    const t = window.setTimeout(finishExit, MESSENGER_PILLAR_LIST_EXIT_MS + 40);
    return () => window.clearTimeout(t);
  }, [phase, finishExit]);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (exitingRef.current) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const a = t.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute("href")?.trim() ?? "";
      if (!href) return;
      /** Tier1 back to messenger hub only — room forward must not take exit path. */
      const toHub =
        href === "/community-messenger" ||
        href.startsWith("/community-messenger?") ||
        (href.startsWith("/community-messenger/") &&
          !href.includes("/trade-chats") &&
          !href.includes("/delivery-chats") &&
          !href.includes("/rooms/") &&
          !href.includes("/calls"));
      if (!toHub) return;
      /** Only intercept when this surface is the active pillar page (data attr). */
      const shell = a.closest("[data-messenger-pillar-motion-shell]");
      if (!shell) {
        /** Header back lives outside shell — intercept by path match when on pillar route. */
        const path = window.location.pathname;
        if (path !== `/community-messenger/${pillar === "trade" ? "trade-chats" : "delivery-chats"}`) {
          return;
        }
      }
      ev.preventDefault();
      ev.stopPropagation();
      exitingRef.current = true;
      exitHrefRef.current = href;
      setPhase("exit");
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [pillar]);

  const className =
    phase === "enter"
      ? "sam-messenger-pillar-list-enter flex h-full min-h-0 flex-col"
      : phase === "exit"
        ? "sam-messenger-pillar-list-exit flex h-full min-h-0 flex-col"
        : "flex h-full min-h-0 flex-col";

  return (
    <div
      className={className}
      data-domain-pillar-segment={pillar}
      data-messenger-pillar-enter={phase === "enter" ? "1" : undefined}
      data-messenger-pillar-exit={phase === "exit" ? "1" : undefined}
      data-messenger-pillar-enter-ms={String(MESSENGER_PILLAR_LIST_ENTER_MS)}
      data-messenger-pillar-motion-shell={pillar}
    >
      {children}
    </div>
  );
}
