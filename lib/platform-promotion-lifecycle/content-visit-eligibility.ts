/**
 * Pure eligibility: same-Event coordination excludes interruptive popup candidates.
 */

import {
  extractEventIdFromPopupCta,
} from "@/lib/platform-promotion-lifecycle/content-visit-contract";

export function isPopupCandidateCoordinatedAway(input: {
  ctaType?: string | null;
  ctaTarget?: string | null;
  href?: string | null;
  coordinatedEventIds: ReadonlySet<string> | readonly string[] | null | undefined;
}): boolean {
  let set: Set<string>;
  if (input.coordinatedEventIds instanceof Set) {
    set = input.coordinatedEventIds as Set<string>;
  } else if (Array.isArray(input.coordinatedEventIds)) {
    set = new Set(input.coordinatedEventIds.map((x) => String(x).trim()).filter(Boolean));
  } else {
    set = new Set();
  }
  if (set.size === 0) return false;
  const eventId = extractEventIdFromPopupCta({
    ctaType: input.ctaType,
    ctaTarget: input.ctaTarget,
    href: input.href,
  });
  if (!eventId) return false;
  return set.has(eventId);
}
