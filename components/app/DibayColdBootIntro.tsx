"use client";

import { useLayoutEffect } from "react";
import { isColdAppLaunchNavigation } from "@/lib/app-boot/cold-boot-detect";
import { DIBAY_COLD_BOOT_INTRO_DOM_ID } from "@/lib/app-boot/cold-boot-constants";
import {
  getAppReadySnapshot,
  markAppReady,
  subscribeAppReady,
} from "@/lib/app-boot/dibay-boot-metrics";

/**
 * Cold-boot web intro controller.
 *
 * Markup lives in root layout (first HTML) so WebView paints logo+spinner before React.
 * This client only wires the hide signal — does not remount intro on route changes.
 *
 * Hide on: shellReady / auth_shell_fallback / error_boundary / non-cold session.
 * DO NOT: forced minimum display delay · wait for badge/API/profile.
 */
export function DibayColdBootIntroController(): null {
  useLayoutEffect(() => {
    const hideIfReady = () => {
      if (getAppReadySnapshot()) {
        const el = document.getElementById(DIBAY_COLD_BOOT_INTRO_DOM_ID);
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

    // Warm resume / in-session reload — never keep intro waiting for shellReady again.
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
