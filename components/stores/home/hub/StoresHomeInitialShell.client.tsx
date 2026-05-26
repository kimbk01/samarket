"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { STORES_HOME_INITIAL_SHELL_SSR_ID } from "@/lib/stores/stores-home-initial-shell";

/**
 * hydration 직후 SSR shell 제거 — client hub 만 표시(중복 방지).
 */
export function StoresHomeInitialShellClient({ children }: { children: ReactNode }) {
  const [hubVisible, setHubVisible] = useState(false);

  useLayoutEffect(() => {
    const ssr = document.getElementById(STORES_HOME_INITIAL_SHELL_SSR_ID);
    if (ssr) {
      ssr.hidden = true;
      ssr.setAttribute("aria-hidden", "true");
    }
    setHubVisible(true);
  }, []);

  return (
    <div className={hubVisible ? "stores-home-hub-interactive" : "hidden"} aria-hidden={!hubVisible}>
      {children}
    </div>
  );
}
