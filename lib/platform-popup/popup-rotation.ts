/**
 * CUT 1 — deterministic rotation among eligible interruptive popups.
 * No Math.random(). 계약 §6 순서(영역 지정 > 전체 → 우선순위)가 먼저이고,
 * 같은 순위 안에서만 덜 본 팝업이 먼저(로테이션) — 광고 감사 G-4 (Owner 승인 2026-11-03).
 */

import type { PlatformPopupCandidate } from "@/lib/platform-popup/resolve-popup-ad";
import { platformPopupIsDomainTargeted } from "@/lib/platform-popup/surfaces";

function lastShownMs(c: PlatformPopupCandidate): number {
  if (c.lastImpressionAt == null) return Number.NEGATIVE_INFINITY;
  const t =
    c.lastImpressionAt instanceof Date
      ? c.lastImpressionAt.getTime()
      : new Date(c.lastImpressionAt).getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Sort: domain > GLOBAL → priority DESC → never shown first → oldest impression → start ASC → id.
 */
export function comparePopupCandidatesForRotation(
  a: PlatformPopupCandidate,
  b: PlatformPopupCandidate
): number {
  const aDomain = platformPopupIsDomainTargeted(a.surfaces) ? 1 : 0;
  const bDomain = platformPopupIsDomainTargeted(b.surfaces) ? 1 : 0;
  if (aDomain !== bDomain) return bDomain - aDomain;

  if (a.priority !== b.priority) return b.priority - a.priority;

  const aShown = lastShownMs(a);
  const bShown = lastShownMs(b);
  if (aShown !== bShown) return aShown - bShown;

  const aStart = a.startAt ? new Date(a.startAt).getTime() : Number.POSITIVE_INFINITY;
  const bStart = b.startAt ? new Date(b.startAt).getTime() : Number.POSITIVE_INFINITY;
  const aStartSafe = Number.isNaN(aStart) ? Number.POSITIVE_INFINITY : aStart;
  const bStartSafe = Number.isNaN(bStart) ? Number.POSITIVE_INFINITY : bStart;
  if (aStartSafe !== bStartSafe) return aStartSafe - bStartSafe;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
