/**
 * CUT 1 — deterministic rotation among eligible interruptive popups.
 * No Math.random(). 영역 지정 > 전체가 먼저이고, 그 다음은 **덜 본 팝업이 먼저**(진입마다 교체).
 * 우선순위는 같은 정도로 덜 본 후보끼리의 순서로만 쓴다.
 * 진입 감사 PO-5 (2026-11-17 · Owner 「설계안대로 진행」): 예전(G-4)에는 우선순위가 덜 본 것보다 앞서
 * 숫자가 높은 팝업 1개가 매번 나왔다.
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
 * Sort: domain > GLOBAL → never shown first → oldest impression → priority DESC → start ASC → id.
 */
export function comparePopupCandidatesForRotation(
  a: PlatformPopupCandidate,
  b: PlatformPopupCandidate
): number {
  const aDomain = platformPopupIsDomainTargeted(a.surfaces) ? 1 : 0;
  const bDomain = platformPopupIsDomainTargeted(b.surfaces) ? 1 : 0;
  if (aDomain !== bDomain) return bDomain - aDomain;

  const aShown = lastShownMs(a);
  const bShown = lastShownMs(b);
  if (aShown !== bShown) return aShown - bShown;

  if (a.priority !== b.priority) return b.priority - a.priority;

  const aStart = a.startAt ? new Date(a.startAt).getTime() : Number.POSITIVE_INFINITY;
  const bStart = b.startAt ? new Date(b.startAt).getTime() : Number.POSITIVE_INFINITY;
  const aStartSafe = Number.isNaN(aStart) ? Number.POSITIVE_INFINITY : aStart;
  const bStartSafe = Number.isNaN(bStart) ? Number.POSITIVE_INFINITY : bStart;
  if (aStartSafe !== bStartSafe) return aStartSafe - bStartSafe;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
