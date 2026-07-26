"use client";

import { useLayoutEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStartupConfigCached, scheduleStartupConfigRefresh } from "@/lib/startup/startup-config-client";
import { resolveInitialAppSurfacePath } from "@/lib/startup/initial-app-surface";
import { isColdAppLaunchNavigation } from "@/lib/startup/startup-detect";

const APPLIED_KEY = "dibay:startup:initial-surface-applied";

function isRootCommunityPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/philife" || pathname === "/community";
}

/**
 * Cold start only: apply cached Admin initialSurface when Cap/Web landed on community root.
 * Never overrides deep links / auth callbacks (non-root paths). Never waits on network.
 */
export function InitialSurfaceBootstrap(): null {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useLayoutEffect(() => {
    scheduleStartupConfigRefresh();

    if (typeof window === "undefined") return;
    if (!isColdAppLaunchNavigation()) return;

    try {
      if (sessionStorage.getItem(APPLIED_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const pathOnly = pathname.split("?")[0] || "/";
    // Explicit deep link / non-root entry — do not redirect to Admin surface.
    if (!isRootCommunityPath(pathOnly)) {
      try {
        sessionStorage.setItem(APPLIED_KEY, "1");
      } catch {
        /* ignore */
      }
      return;
    }

    const cfg = getStartupConfigCached();
    const target = resolveInitialAppSurfacePath({
      adminInitialSurface: cfg.initialSurface,
    });
    const targetPath = target.split("?")[0] || target;

    try {
      sessionStorage.setItem(APPLIED_KEY, "1");
    } catch {
      /* ignore */
    }

    if (targetPath === pathOnly || (isRootCommunityPath(targetPath) && isRootCommunityPath(pathOnly))) {
      // Already on community (or equivalent). Sync native prefs for next launch.
      try {
        (
          window as unknown as {
            DibayBootBridge?: { setInitialSurface?: (s: string) => void };
          }
        ).DibayBootBridge?.setInitialSurface?.(cfg.initialSurface);
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      (
        window as unknown as {
          DibayBootBridge?: { setInitialSurface?: (s: string) => void };
        }
      ).DibayBootBridge?.setInitialSurface?.(cfg.initialSurface);
    } catch {
      /* ignore */
    }

    router.replace(target);
  }, [pathname, router]);

  return null;
}
