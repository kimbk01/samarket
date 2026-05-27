"use client";

import type { AppLanguageCode } from "@/lib/i18n/config";
import type { UserRegion } from "@/lib/regions/types";
import { storesBrowseNavSubSlug } from "@/components/stores/browse/stores-browse-paths";
import { setBrowsePrimaryTabOptimisticSlug } from "@/lib/stores/browse-primary-tab-navigation";
import { setBrowseSubChipOptimisticSub } from "@/lib/stores/browse-sub-chip-navigation";
import { scheduleStoresBrowseListPrewarm } from "@/lib/stores/stores-browse-prewarm-coordinator";
import { triggerLightTapFeedback } from "@/lib/ui/light-tap-feedback";

type TapEvent = { pointerType?: string } | undefined;

function scheduleAfterPress(run: () => void): void {
  if (typeof window === "undefined") {
    run();
    return;
  }
  window.setTimeout(run, 0);
}

/**
 * CONTRACT — browse·홈 업종 탭/칩 pointerdown 단일 진입.
 * DO NOT: prewarm·햅틱·optimistic 을 컴포넌트마다 복제.
 */
export function onBrowsePrimaryTaxonomyPointerDown(opts: {
  ev?: TapEvent;
  primarySlug: string;
  language?: AppLanguageCode;
  primaryRegion?: UserRegion | null;
}): void {
  scheduleAfterPress(() => {
    triggerLightTapFeedback(opts.ev);
    scheduleStoresBrowseListPrewarm({
      language: opts.language,
      primary: opts.primarySlug.trim().toLowerCase(),
      sub: "all",
      primaryRegion: opts.primaryRegion ?? null,
    });
  });
}

export function onBrowsePrimaryTaxonomyCommit(primarySlug: string): void {
  const slug = primarySlug.trim().toLowerCase();
  if (!slug) return;
  setBrowseSubChipOptimisticSub(null);
  setBrowsePrimaryTabOptimisticSlug(slug);
}

export function onBrowseSubTaxonomyPointerDown(opts: {
  ev?: TapEvent;
  primarySlug: string;
  subSlug: string;
  language?: AppLanguageCode;
  primaryRegion?: UserRegion | null;
}): void {
  scheduleAfterPress(() => {
    triggerLightTapFeedback(opts.ev);
    scheduleStoresBrowseListPrewarm({
      language: opts.language,
      primary: opts.primarySlug.trim().toLowerCase(),
      sub: opts.subSlug,
      primaryRegion: opts.primaryRegion ?? null,
    });
  });
}

export function onBrowseSubTaxonomyCommit(subSlug: string): void {
  setBrowseSubChipOptimisticSub(storesBrowseNavSubSlug(subSlug));
}
