/**
 * Cold-start initial surface SSOT — Admin enum → canonical BottomNav routes.
 *
 * Priority (resolveInitialAppSurfacePath):
 * 1. Explicit deep link / pending native path
 * 2. OAuth / auth callback destination
 * 3. Explicit in-app continue target (caller-provided)
 * 4. Admin `initialSurface` (cached)
 * 5. Community fallback
 *
 * DO NOT: wait on remote Admin API · prefer last-tab cache over Admin · invent new routes.
 */

import { BOTTOM_NAV_ITEMS } from "@/lib/main-menu/bottom-nav-config";

export const INITIAL_APP_SURFACES = [
  "community",
  "trade",
  "food",
  "chat",
  "my",
] as const;

export type InitialAppSurface = (typeof INITIAL_APP_SURFACES)[number];

const SURFACE_TO_TAB_ID: Record<InitialAppSurface, string> = {
  community: "community",
  trade: "home",
  food: "stores",
  chat: "chat",
  my: "my",
};

export const DEFAULT_INITIAL_APP_SURFACE: InitialAppSurface = "community";

export function isInitialAppSurface(value: unknown): value is InitialAppSurface {
  return (
    typeof value === "string" &&
    (INITIAL_APP_SURFACES as readonly string[]).includes(value)
  );
}

export function normalizeInitialAppSurface(value: unknown): InitialAppSurface {
  if (isInitialAppSurface(value)) return value;
  return DEFAULT_INITIAL_APP_SURFACE;
}

/** Canonical href from BottomNav SSOT — never invent paths. */
export function pathForInitialAppSurface(surface: InitialAppSurface): string {
  const tabId = SURFACE_TO_TAB_ID[surface];
  const item = BOTTOM_NAV_ITEMS.find((t) => t.id === tabId);
  if (item?.href) return item.href;
  return "/philife";
}

export type ResolveInitialAppSurfaceInput = {
  deepLinkPath?: string | null;
  authCallbackPath?: string | null;
  continuePath?: string | null;
  adminInitialSurface?: InitialAppSurface | null;
};

function isUsableAppPath(path: string | null | undefined): path is string {
  if (!path || typeof path !== "string") return false;
  const p = path.trim();
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//")) return false;
  return true;
}

/**
 * Single authority for cold-start path (relative, may include query).
 */
export function resolveInitialAppSurfacePath(
  input: ResolveInitialAppSurfaceInput = {}
): string {
  if (isUsableAppPath(input.deepLinkPath)) return input.deepLinkPath.trim();
  if (isUsableAppPath(input.authCallbackPath)) return input.authCallbackPath.trim();
  if (isUsableAppPath(input.continuePath)) return input.continuePath.trim();
  const surface = normalizeInitialAppSurface(input.adminInitialSurface);
  return pathForInitialAppSurface(surface);
}
