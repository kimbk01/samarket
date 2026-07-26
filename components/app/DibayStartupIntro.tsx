/**
 * Startup Intro controller — Web visual intro is disabled (Native splash only).
 * Keeps config cache refresh for Admin initialSurface / next-launch settings.
 */
"use client";

import { useLayoutEffect } from "react";
import { isColdAppLaunchNavigation } from "@/lib/startup/startup-detect";
import {
  getStartupConfigCached,
  scheduleStartupConfigRefresh,
} from "@/lib/startup/startup-config-client";
import {
  getAppReadySnapshot,
  markAppReady,
  subscribeAppReady,
} from "@/lib/startup/startup-metrics";

export function DibayStartupIntroController(): null {
  useLayoutEffect(() => {
    // Touch cache so initialSurface is warm; never blocks App Ready.
    void getStartupConfigCached();
    scheduleStartupConfigRefresh();

    if (getAppReadySnapshot()) return;

    if (!isColdAppLaunchNavigation()) {
      markAppReady("warm_or_non_cold");
      return;
    }

    return subscribeAppReady(() => {
      /* App Ready already marked by shellReady path */
    });
  }, []);

  return null;
}
