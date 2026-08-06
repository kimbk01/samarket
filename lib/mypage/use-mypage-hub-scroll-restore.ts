"use client";

import { useEffect, useLayoutEffect } from "react";
import {
  ensureMypageHubManualScrollRestoration,
  isMypageHubPath,
  noteMypageHubScrollPopstatePending,
  prepareMypageHubScrollForLeave,
  saveMypageHubScroll,
  tryRestoreMypageHubScroll,
} from "@/lib/mypage/mypage-hub-scroll-restore";
import {
  getMainAppScrollRoot,
  subscribeAppShellScroll,
} from "@/lib/layout/main-app-scroll-root";

let popstateListenerInstalled = false;

function ensureMypageHubScrollPopstateListener(): void {
  if (typeof window === "undefined" || popstateListenerInstalled) return;
  popstateListenerInstalled = true;
  ensureMypageHubManualScrollRestoration();
  window.addEventListener("popstate", () => {
    // After soft back, pathname may already be /mypage when this fires
    if (isMypageHubPath(window.location.pathname)) {
      noteMypageHubScrollPopstatePending();
    } else {
      // Leaving hub via browser back from child — still mark hub pending for next paint
      noteMypageHubScrollPopstatePending();
    }
  });
}

/**
 * `/mypage` hub only — save scroll on leave; restore on back.
 */
export function useMypageHubScrollRestore(ready = true): void {
  useEffect(() => {
    ensureMypageHubManualScrollRestoration();
    ensureMypageHubScrollPopstateListener();

    const onClickCapture = (ev: MouseEvent) => {
      if (!isMypageHubPath(window.location.pathname)) return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const a = t.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#")) return;
      let path = href;
      try {
        if (href.startsWith("http")) path = new URL(href).pathname;
      } catch {
        return;
      }
      if (isMypageHubPath(path)) return;
      prepareMypageHubScrollForLeave();
    };

    document.addEventListener("click", onClickCapture, true);
    const unsub = subscribeAppShellScroll(() => {
      if (isMypageHubPath(window.location.pathname)) saveMypageHubScroll();
    });

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      unsub();
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || typeof window === "undefined") return;
    if (!isMypageHubPath(window.location.pathname)) return;
    // Ensure root exists before restore attempts
    try {
      getMainAppScrollRoot();
    } catch {
      return;
    }
    tryRestoreMypageHubScroll();
  }, [ready]);
}
