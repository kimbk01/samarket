"use client";

import { startTransition, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { STORES_HOME_INITIAL_SHELL_SSR_ID } from "@/lib/stores/stores-home-initial-shell";
import { useStoresHomeFirstLcp } from "@/lib/stores/use-stores-home-first-lcp";

/**
 * SSR shell 유지 → 첫 LCP(hero) 후 client hub 마운트.
 * DO NOT: `hidden` 으로 children 만 가리기 — React 트리는 즉시 hydrate 되어 long task 유발.
 */
export function StoresHomeInitialShellClient({ children }: { children: ReactNode }) {
  const lcpReady = useStoresHomeFirstLcp();
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    if (!lcpReady) return;
    startTransition(() => setInteractive(true));
  }, [lcpReady]);

  useLayoutEffect(() => {
    if (!interactive) return;
    const ssr = document.getElementById(STORES_HOME_INITIAL_SHELL_SSR_ID);
    if (ssr) {
      ssr.hidden = true;
      ssr.setAttribute("aria-hidden", "true");
    }
  }, [interactive]);

  if (!interactive) return null;

  return (
    <div className="stores-home-hub-interactive" aria-hidden={false}>
      {children}
    </div>
  );
}
