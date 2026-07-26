"use client";

import { useLayoutEffect } from "react";
import { isColdAppLaunchNavigation } from "@/lib/startup/startup-detect";
import {
  applyStartupConfigToDom,
  getStartupConfigCached,
  scheduleStartupConfigRefresh,
} from "@/lib/startup/startup-config-client";
import { DIBAY_STARTUP_INTRO_DOM_ID } from "@/lib/startup/startup-constants";
import {
  getAppReadySnapshot,
  markAppReady,
  subscribeAppReady,
} from "@/lib/startup/startup-metrics";

/**
 * Startup web intro controller (Remote React path).
 *
 * Markup lives in root layout (first HTML) so WebView paints logo+spinner before React.
 * Local Boot Shell sets handoff flag — controller treats that as non-cold (no second intro).
 * Remote fetch runs after paint for *next* launch — never blocks App Ready.
 *
 * Hide on: shellReady / auth_shell_fallback / error_boundary / non-cold session / handoff.
 * DO NOT: forced minimum display delay · wait for badge/API/profile · block on remote fetch.
 */
export function DibayStartupIntroController(): null {
  useLayoutEffect(() => {
    applyStartupConfigToDom(getStartupConfigCached());
    scheduleStartupConfigRefresh();

    const hideIfReady = () => {
      if (getAppReadySnapshot()) {
        const el = document.getElementById(DIBAY_STARTUP_INTRO_DOM_ID);
        if (el && !el.hasAttribute("hidden")) {
          el.setAttribute("data-ready", "1");
          el.setAttribute("hidden", "");
          el.setAttribute("aria-hidden", "true");
        }
        return true;
      }
      return false;
    };

    if (hideIfReady()) return;

    // Warm resume / handoff / in-session reload — never keep intro waiting for shellReady again.
    if (!isColdAppLaunchNavigation()) {
      markAppReady("warm_or_non_cold");
      return;
    }

    if (hideIfReady()) return;

    return subscribeAppReady(() => {
      hideIfReady();
    });
  }, []);

  return null;
}
