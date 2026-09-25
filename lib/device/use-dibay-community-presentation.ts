"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useDibayAppShellAuthority } from "@/lib/device/use-dibay-app-shell";
import {
  classifyCommunityPresentationSurface,
  resolveCommunityPresentation,
  shouldComposeCommunityDual,
  type DibayCommunityPresentation,
  type DibayCommunityPresentationSurface,
} from "@/lib/device/dibay-community-presentation";

export type DibayCommunityPresentationAuthority = {
  presentation: DibayCommunityPresentation;
  surface: DibayCommunityPresentationSurface;
  composed: boolean;
  layoutMode: ReturnType<typeof useDibayAppShellAuthority>["layoutMode"];
  deviceClass: ReturnType<typeof useDibayAppShellAuthority>["deviceClass"];
  usableWidthPx: number;
  resolved: boolean;
};

export function useDibayCommunityPresentation(): DibayCommunityPresentationAuthority {
  const shell = useDibayAppShellAuthority();
  const pathname = usePathname();
  return useMemo(() => {
    const presentation = resolveCommunityPresentation(shell.layoutMode);
    const surface = classifyCommunityPresentationSurface(pathname);
    return {
      presentation,
      surface,
      composed: shouldComposeCommunityDual({ presentation, surface }),
      layoutMode: shell.layoutMode,
      deviceClass: shell.deviceClass,
      usableWidthPx: shell.usableWidthPx,
      resolved: shell.resolved,
    };
  }, [shell, pathname]);
}
