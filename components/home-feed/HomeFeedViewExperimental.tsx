"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";
import { getBlockedUserIds } from "@/lib/reports/mock-blocked-users";
import { getHomeFeedPolicies } from "@/lib/home-feed/mock-home-feed-policies";
import { getFeedCandidates } from "@/lib/home-feed/mock-feed-candidates";
import { buildHomeFeed } from "@/lib/home-feed/home-feed-utils";
import { getLiveVersionId } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import {
  getFeedMode,
  getEmergencyNotice,
  getDisabledSectionKeys,
  getFallbackVersionId,
} from "@/lib/feed-emergency/feed-emergency-utils";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";
import { getPersonalizedFeedPolicies } from "@/lib/personalized-feed/mock-personalized-feed-policies";
import { getUserBehaviorProfile } from "@/lib/personalized-feed/mock-user-behavior-profiles";
import { getPersonalizedCandidatesFromFeedCandidates } from "@/lib/personalized-feed/mock-personalized-candidates";
import { buildPersonalizedFeedSections } from "@/lib/personalized-feed/personalized-feed-utils";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/mock-personalized-feed-policies";
import { recordRecommendationClick } from "@/lib/recommendation/mock-recommendation-impressions";
import { getAssignedVersionId } from "@/lib/recommendation-experiments/mock-user-feed-assignments";
import { getMemberType } from "@/lib/admin-users/mock-admin-users";
import type { HomeFeedItem } from "@/lib/types/home-feed";
import { HomeFeedSection } from "./HomeFeedSection";
import { EmergencyNoticeBar } from "./EmergencyNoticeBar";

function personalizedToFeedItem(p: {
  id: string;
  targetId: string;
  title: string;
  thumbnail: string;
  price: number;
  locationLabel: string;
  reasonLabel: string;
  score: number;
}): HomeFeedItem {
  return {
    ...p,
    itemType: "product",
  };
}

/** mock·실험용 홈 피드 — production·비실험 환경에서는 `HomeContent` 가 마운트하지 않음 */
export function HomeFeedViewExperimental() {
  const { currentRegionName } = useRegion();

  const userRegion = useMemo(() => {
    if (!currentRegionName?.trim()) return null;
    const parts = currentRegionName.split("·").map((s) => s.trim());
    return {
      region: parts[0] ?? "",
      city: parts[1] ?? "",
      barangay: parts[2] ?? "",
    };
  }, [currentRegionName]);

  const currentUserId = getCurrentUserId();
  const blockedIds = useMemo(
    () => getBlockedUserIds(currentUserId),
    [currentUserId]
  );

  /** 운영 DB(admin_settings) 스냅샷 — 없으면 로컬 상태(getFeedMode 등) 폴백 */
  const [emergencySnap, setEmergencySnap] = useState<{
    mode: ReturnType<typeof getFeedMode>;
    emergencyNotice: { enabled: boolean; text: string };
    disabledSectionKeys: FeedSectionOverrideKey[];
    fallbackVersionId: string | null;
  } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/feed/emergency?surface=home", { signal: ac.signal })
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          mode?: ReturnType<typeof getFeedMode>;
          emergencyNotice?: { enabled: boolean; text: string };
          disabledSectionKeys?: FeedSectionOverrideKey[];
          fallbackVersionId?: string | null;
        }) => {
          if (!j?.ok || !j.mode) return;
          setEmergencySnap({
            mode: j.mode,
            emergencyNotice: j.emergencyNotice ?? { enabled: false, text: "" },
            disabledSectionKeys: Array.isArray(j.disabledSectionKeys) ? j.disabledSectionKeys : [],
            fallbackVersionId: j.fallbackVersionId ?? null,
          });
        }
      )
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const feedMode = emergencySnap?.mode ?? getFeedMode("home");
  const emergencyNotice = emergencySnap?.emergencyNotice ?? getEmergencyNotice("home");
  const disabledSectionSet = useMemo(() => {
    const keys = emergencySnap?.disabledSectionKeys ?? getDisabledSectionKeys("home");
    return new Set<FeedSectionOverrideKey>(keys);
  }, [emergencySnap]);

  const policies = useMemo(() => {
    const base = getHomeFeedPolicies();
    let merged = base;

    if (feedMode === "kill_switch") {
      merged = base.map((p) =>
        p.sectionKey === "local_latest"
          ? { ...p, isActive: true, maxItems: 20 }
          : { ...p, isActive: false }
      );
    } else if (feedMode === "fallback") {
      const fallbackVersionId = emergencySnap?.fallbackVersionId ?? getFallbackVersionId("home");
      if (fallbackVersionId) {
        const version = getFeedVersionById(fallbackVersionId);
        if (version?.sectionConfig?.length) {
          merged = base.map((p) => {
            const entry = version.sectionConfig.find((c) => c.sectionKey === p.sectionKey);
            if (!entry) return p;
            return {
              ...p,
              isActive: entry.isActive,
              maxItems: entry.maxItems ?? p.maxItems,
            };
          });
        } else {
          merged = base.map((p) =>
            p.sectionKey === "local_latest" || p.sectionKey === "bumped"
              ? { ...p, isActive: true, maxItems: Math.min(p.maxItems, 15) }
              : { ...p, isActive: false }
          );
        }
      } else {
        merged = base.map((p) =>
          p.sectionKey === "local_latest" || p.sectionKey === "bumped"
            ? { ...p, isActive: true, maxItems: Math.min(p.maxItems, 15) }
            : { ...p, isActive: false }
        );
      }
    } else {
      const liveVersionId = getLiveVersionId("home");
      if (liveVersionId) {
        const version = getFeedVersionById(liveVersionId);
        if (version?.sectionConfig?.length) {
          merged = base.map((p) => {
            const entry = version.sectionConfig.find((c) => c.sectionKey === p.sectionKey);
            if (!entry) return p;
            return {
              ...p,
              isActive: entry.isActive,
              maxItems: entry.maxItems ?? p.maxItems,
            };
          });
        }
      }
    }

    return merged.map((p) =>
      disabledSectionSet.has(p.sectionKey as FeedSectionOverrideKey)
        ? { ...p, isActive: false }
        : p
    );
  }, [feedMode, disabledSectionSet, emergencySnap?.fallbackVersionId]);
  const candidates = useMemo(() => {
    const list = getFeedCandidates(currentRegionName ?? undefined, userRegion);
    return list.filter((c) => !blockedIds.includes(c.sellerId));
  }, [currentRegionName, userRegion, blockedIds]);

  const homeSections = useMemo(
    () =>
      buildHomeFeed(policies, candidates, {
        userRegion,
        userRegionLabel: currentRegionName ?? "",
        userId: currentUserId,
        writeLog: true,
      }),
    [policies, candidates, userRegion, currentRegionName, currentUserId]
  );

  const personalizedPolicies = useMemo(() => getPersonalizedFeedPolicies(), []);
  const profile = useMemo(
    () => getUserBehaviorProfile(currentUserId, currentRegionName ?? undefined),
    [currentUserId, currentRegionName]
  );
  const personalizedCandidates = useMemo(
    () => getPersonalizedCandidatesFromFeedCandidates(candidates),
    [candidates]
  );
  const seenFromHome = useMemo(() => {
    const set = new Set<string>();
    for (const s of homeSections) {
      for (const item of s.items) set.add(item.id);
    }
    return set;
  }, [homeSections]);
  const personalizedResults = useMemo(
    () =>
      buildPersonalizedFeedSections(
        personalizedPolicies,
        personalizedCandidates,
        profile,
        { userId: currentUserId, writeLog: true, seenIds: seenFromHome }
      ),
    [
      personalizedPolicies,
      personalizedCandidates,
      profile,
      currentUserId,
      seenFromHome,
    ]
  );

  useMemo(() => {
    getAssignedVersionId(currentUserId, "home", {
      region: userRegion?.region ?? "",
      memberType: getMemberType(currentUserId),
    });
  }, [currentUserId, userRegion?.region]);

  const personalizedSectionsForFeed = useMemo(
    () =>
      personalizedResults.map((r) => ({
        sectionKey: r.sectionKey,
        items: r.items.map((i) => personalizedToFeedItem(i)),
        generatedAt: r.generatedAt,
        sectionLabel: PERSONALIZED_SECTION_LABELS[r.sectionKey],
      })),
    [personalizedResults]
  );

  const sections = useMemo(
    () =>
      [...homeSections, ...personalizedSectionsForFeed].filter(
        (s) => !disabledSectionSet.has(s.sectionKey as FeedSectionOverrideKey)
      ),
    [homeSections, personalizedSectionsForFeed, disabledSectionSet]
  );

  const handleRecommendationClick = useCallback(
    (sectionKey: string, candidateId: string) => {
      recordRecommendationClick(currentUserId, sectionKey, candidateId);
    },
    [currentUserId]
  );

  const hasAnyItems = sections.some((s) => s.items.length > 0);
  if (!hasAnyItems) {
    return (
      <div className="space-y-3">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-[14px] text-sam-muted">등록된 상품이 없어요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {emergencyNotice.enabled && (
        <EmergencyNoticeBar text={emergencyNotice.text} />
      )}
      {sections.map((section) => (
        <HomeFeedSection
          key={section.sectionKey}
          section={section}
          surface="home"
          onRecommendationClick={handleRecommendationClick}
        />
      ))}
    </div>
  );
}
