/**
 * 29단계: 홈 피드 엔진 — 섹션별 혼합·정렬·중복 제거
 */

import type {
  HomeFeedPolicy,
  HomeFeedSectionKey,
  HomeFeedSectionResult,
  HomeFeedItem,
  FeedCandidate,
  HomeFeedGenerationLog,
} from "@/lib/types/home-feed";
import type { UserRegionContext } from "@/lib/exposure/exposure-score-utils";
import { getExposureScorePolicyBySurface } from "@/lib/exposure/mock-exposure-score-policies";
import { computeAndSortCandidates } from "@/lib/exposure/exposure-score-utils";
import type { ExposureCandidate } from "@/lib/types/exposure";
import { addHomeFeedGenerationLog } from "./mock-home-feed-generation-logs";

const excludeStatus = ["hidden", "blinded", "deleted"] as const;

function candidateMatchesRegion(
  c: FeedCandidate,
  userRegion: UserRegionContext | null,
  scope: "barangay" | "city" | "region"
): boolean {
  if (!userRegion?.region) return true;
  const r = c.region?.trim();
  const ur = userRegion.region?.trim();
  if (scope === "region") return r === ur;
  const cty = c.city?.trim();
  const ucty = userRegion.city?.trim();
  if (scope === "city") return r === ur && cty === ucty;
  const b = c.barangay?.trim();
  const ub = userRegion.barangay?.trim();
  return r === ur && cty === ucty && b === ub;
}

function feedCandidateToExposureCandidate(c: FeedCandidate): ExposureCandidate {
  return {
    id: c.id,
    title: c.title,
    sellerId: c.sellerId,
    sellerNickname: c.sellerNickname,
    memberType: c.memberType,
    businessProfileId: c.businessProfileId,
    isBusinessItem: c.isBusinessItem,
    price: c.price,
    status: c.status,
    likesCount: c.likesCount,
    chatCount: c.chatCount,
    viewCount: c.viewCount,
    createdAt: c.createdAt,
    bumpedAt: c.bumpedAt,
    region: c.region,
    city: c.city,
    barangay: c.barangay,
    distance: c.distance,
    adPromotionStatus: c.adPromotionStatus,
    pointPromotionStatus: c.pointPromotionStatus,
    shopFeaturedStatus: c.shopFeaturedStatus,
  };
}

function toFeedItem(c: FeedCandidate, reasonLabel: string, score: number): HomeFeedItem {
  const locationLabel = [c.region, c.city, c.barangay].filter(Boolean).join(" · ") || "-";
  let itemType: HomeFeedItem["itemType"] = "product";
  if (c.adPromotionStatus === "active" || c.pointPromotionStatus === "active") itemType = "sponsored";
  if (c.isBusinessItem && c.shopFeaturedStatus === "active") itemType = "shop";
  return {
    id: c.id,
    itemType,
    targetId: c.id,
    title: c.title,
    thumbnail: c.thumbnail,
    price: c.price,
    locationLabel,
    reasonLabel,
    score,
  };
}

function sortCandidates(
  list: FeedCandidate[],
  sortMode: HomeFeedPolicy["sortMode"],
  userRegion: UserRegionContext | null
): FeedCandidate[] {
  const policy = getExposureScorePolicyBySurface("home");
  if (sortMode === "featured" && policy) {
    const exposure = list.map(feedCandidateToExposureCandidate);
    const sorted = computeAndSortCandidates(exposure, policy, "home", userRegion);
    const idOrder = new Map(sorted.map((s, i) => [s.candidate.id, i]));
    return [...list].sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));
  }
  const arr = [...list];
  switch (sortMode) {
    case "latest":
      return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case "nearby":
      return arr.sort((a, b) => a.distance - b.distance);
    case "popular":
      return arr.sort((a, b) => b.likesCount + b.chatCount - (a.likesCount + a.chatCount));
    case "mixed":
      return arr.sort(() => Math.random() - 0.5);
    default:
      return arr;
  }
}

export interface BuildHomeFeedOptions {
  userRegion?: UserRegionContext | null;
  userRegionLabel?: string;
  userId?: string;
  writeLog?: boolean;
}

export function buildHomeFeed(
  policies: HomeFeedPolicy[],
  candidates: FeedCandidate[],
  options: BuildHomeFeedOptions = {}
): HomeFeedSectionResult[] {
  const { userRegion = null, userRegionLabel = "", userId = "me", writeLog = false } = options;
  const activePolicies = policies
    .filter((p) => p.isActive)
    .sort((a, b) => a.priorityOrder - b.priorityOrder);

  const baseFiltered = candidates.filter(
    (c) => !excludeStatus.includes(c.status as (typeof excludeStatus)[number])
  );

  const seenIds = new Set<string>();
  const results: HomeFeedSectionResult[] = [];
  const now = new Date().toISOString();

  for (const policy of activePolicies) {
    let sectionCandidates = baseFiltered.filter((c) =>
      candidateMatchesRegion(c, userRegion, policy.regionScope)
    );

    if (policy.sectionKey === "sponsored") {
      sectionCandidates = sectionCandidates.filter(
        (c) => c.adPromotionStatus === "active" || c.pointPromotionStatus === "active"
      );
    } else if (policy.sectionKey === "bumped") {
      sectionCandidates = sectionCandidates.filter((c) => !!c.bumpedAt);
      sectionCandidates = sortCandidates(
        sectionCandidates,
        "latest",
        userRegion
      ).sort(
        (a, b) =>
          new Date(b.bumpedAt!).getTime() - new Date(a.bumpedAt!).getTime()
      );
    } else if (policy.sectionKey === "premium_shops") {
      sectionCandidates = sectionCandidates.filter(
        (c) =>
          (policy.allowPremiumBoost && c.memberType === "premium") ||
          (policy.allowBusinessBoost && c.isBusinessItem) ||
          c.shopFeaturedStatus === "active"
      );
    } else if (policy.sectionKey === "recent_based") {
      sectionCandidates = [];
    }

    if (policy.sectionKey !== "bumped") {
      sectionCandidates = sortCandidates(sectionCandidates, policy.sortMode, userRegion);
    }

    const beforeDedupe = sectionCandidates.length;
    const taken: FeedCandidate[] = [];
    for (const c of sectionCandidates) {
      if (taken.length >= policy.maxItems) break;
      if (policy.dedupeEnabled && seenIds.has(c.id)) continue;
      taken.push(c);
      if (policy.dedupeEnabled) seenIds.add(c.id);
    }
    const dedupedCount = beforeDedupe - taken.length;
    const sponsoredIncluded = taken.filter(
      (c) => c.adPromotionStatus === "active" || c.pointPromotionStatus === "active"
    ).length;

    const items: HomeFeedItem[] = taken.map((c, i) => {
      const reason =
        policy.sectionKey === "recommended"
          ? (c.sourceTags.join(", ") || "추천")
          : policy.sectionKey === "sponsored"
            ? "광고"
            : policy.sectionKey === "premium_shops"
              ? "특별회원/상점"
              : policy.sectionKey === "bumped"
                ? "끌올"
                : policy.sectionLabel;
      const score = c.exposureScore ?? 0;
      return toFeedItem(c, reason, score);
    });

    results.push({
      sectionKey: policy.sectionKey,
      items,
      generatedAt: now,
    });

    if (writeLog) {
      addHomeFeedGenerationLog({
        generatedAt: now,
        userRegion: userRegionLabel,
        userId,
        sectionKey: policy.sectionKey,
        candidateCount: sectionCandidates.length,
        finalCount: items.length,
        dedupedCount,
        sponsoredIncluded,
        note: "홈 피드 생성",
      });
    }
  }

  return results;
}
