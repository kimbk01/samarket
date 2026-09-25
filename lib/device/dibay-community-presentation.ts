/**
 * FD5 Community presentation.
 *
 * Consumes FD2 LayoutMode. Does not invent Device identity.
 * SINGLE / STACKED / DUAL are presentation modes, not Device classes.
 */

import type { DibayLayoutMode } from "@/lib/device/dibay-layout-resolver";
import { isCommunityHubRootPath } from "@/lib/community/community-hub-state";
import { parseCommunityPostIdFromHref } from "@/lib/community/community-post-entry-nav";

export type DibayCommunityPresentation = "SINGLE" | "STACKED" | "DUAL";

export type DibayCommunityPresentationSurface = "hub" | "detail" | "other";

export const DIBAY_COMMUNITY_PRESENTATION_LOCK_STATE = "CANDIDATE_NOT_LOCKED" as const;

export function resolveCommunityPresentation(
  layoutMode: DibayLayoutMode,
): DibayCommunityPresentation {
  if (layoutMode === "PHONE_SINGLE") return "SINGLE";
  if (layoutMode === "TABLET_DUAL" || layoutMode === "DESKTOP_DUAL") return "DUAL";
  if (layoutMode === "TABLET_STACKED" || layoutMode === "DESKTOP_STACKED") return "STACKED";
  return "STACKED";
}

export function classifyCommunityPresentationSurface(
  pathname: string | null | undefined,
): DibayCommunityPresentationSurface {
  const path = (pathname ?? "").split("?")[0]?.trim() || "/";
  if (isCommunityHubRootPath(path)) return "hub";
  if (parseCommunityPostIdFromHref(path)) return "detail";
  const normalized = path.replace(/\/+$/, "") || "/";
  if (/^\/community\/posts\/[^/]+$/i.test(normalized)) return "detail";
  return "other";
}

export function shouldComposeCommunityDual(input: {
  presentation: DibayCommunityPresentation;
  surface: DibayCommunityPresentationSurface;
}): boolean {
  return input.presentation === "DUAL" && (input.surface === "hub" || input.surface === "detail");
}
