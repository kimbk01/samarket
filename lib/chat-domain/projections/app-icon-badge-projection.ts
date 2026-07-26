/**
 * Phase H contract mirror — App Icon total snapshot for freeze/tests.
 *
 * Runtime NativeBadgeSync authority is `domain-badge-surface-store` only.
 * DO NOT use this store as a NativeBadgeSync reader/fallback.
 * Independent of Header Bell total — DO NOT mirror Bell.
 */

import type { SurfaceProjectionApplyResult } from "@/lib/chat-domain/projections/surface-projection-types";

export type AppIconBadgeProjectionSourceKind = "network" | "clear" | "domain_authority";

export type AppIconBadgeProjectionSnapshot = {
  totalUnread: number;
  versionMs: number;
  source: AppIconBadgeProjectionSourceKind;
};

let lastAppIcon: AppIconBadgeProjectionSnapshot | null = null;

type AppIconBadgeProjectionSink = (snapshot: AppIconBadgeProjectionSnapshot) => void;

let sink: AppIconBadgeProjectionSink | null = null;

export function registerAppIconBadgeProjectionSink(next: AppIconBadgeProjectionSink): void {
  sink = next;
}

export function getAppIconBadgeProjection(): AppIconBadgeProjectionSnapshot | null {
  return lastAppIcon;
}

export function applyAppIconBadgeProjection(
  snapshot: AppIconBadgeProjectionSnapshot,
): SurfaceProjectionApplyResult {
  lastAppIcon = snapshot;
  sink?.(snapshot);
  return { status: "ok" };
}

/** @internal vitest */
export function __applyAppIconBadgeProjectionForTests(snapshot: AppIconBadgeProjectionSnapshot): void {
  lastAppIcon = snapshot;
}

/** @internal vitest */
export function __resetAppIconBadgeProjectionForTest(): void {
  lastAppIcon = null;
}
