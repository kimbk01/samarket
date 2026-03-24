/**
 * 30단계: 개인화 추천 점수·추천 이유·섹션 빌드
 */

import type {
  PersonalizedFeedPolicy,
  PersonalizedSectionKey,
  PersonalizedFeedResult,
  PersonalizedFeedItem,
  PersonalizedCandidate,
  UserBehaviorProfile,
  PersonalizedFeedLog,
} from "@/lib/types/personalized-feed";
import { addPersonalizedFeedLog } from "./mock-personalized-feed-logs";

const excludeStatus = ["hidden", "blinded", "deleted"] as const;

const REASON_LABELS: Record<string, string> = {
  category_match: "자주 보는 카테고리예요",
  recent_view_similar: "최근 본 상품과 비슷해요",
  recent_favorite_similar: "찜한 상품과 비슷해요",
  recent_chat_similar: "최근 대화한 상품과 비슷해요",
  interest_match: "관심 카테고리예요",
  nearby_popular: "우리 동네 인기 상품이에요",
  premium: "특별회원 상품",
  business: "상점 상품",
};

function computePersonalizedScore(
  c: PersonalizedCandidate,
  profile: UserBehaviorProfile,
  policy: PersonalizedFeedPolicy,
  sectionKey: PersonalizedSectionKey
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const catMatch = profile.favoriteCategories.includes(c.category) ||
    profile.recentViewedCategories.includes(c.category) ||
    profile.recentFavoritedCategories.includes(c.category) ||
    profile.recentChattedCategories.includes(c.category);
  if (catMatch && c.category) {
    score += policy.categoryAffinityWeight;
    if (sectionKey === "interest_based" || sectionKey === "category_based") {
      reasons.push(REASON_LABELS.category_match);
    }
  }

  const viewMatch = profile.recentViewedCategories.includes(c.category);
  if (viewMatch && (sectionKey === "recent_view_based" || sectionKey === "category_based")) {
    score += policy.recentViewWeight;
    reasons.push(REASON_LABELS.recent_view_similar);
  }
  const favMatch = profile.recentFavoritedCategories.includes(c.category);
  if (favMatch && (sectionKey === "recent_favorite_based" || sectionKey === "interest_based")) {
    score += policy.recentFavoriteWeight;
    reasons.push(REASON_LABELS.recent_favorite_similar);
  }
  const chatMatch = profile.recentChattedCategories.includes(c.category);
  if (chatMatch && (sectionKey === "recent_chat_based" || sectionKey === "category_based")) {
    score += policy.recentChatWeight;
    reasons.push(REASON_LABELS.recent_chat_similar);
  }

  if (sectionKey === "interest_based" && profile.favoriteCategories.includes(c.category)) {
    score += policy.categoryAffinityWeight * 0.5;
    reasons.push(REASON_LABELS.interest_match);
  }

  const sameRegion = c.region === profile.preferredRegion;
  if (sameRegion) score += policy.nearbyWeight;
  if (sameRegion && (c.city === profile.preferredCity || c.barangay === profile.preferredBarangay)) {
    reasons.push(REASON_LABELS.nearby_popular);
  }

  const daysAgo = (Date.now() - new Date(c.createdAt).getTime()) / 86400000;
  const recency = Math.max(0, 1 - daysAgo / 30);
  score += recency * policy.recencyWeight;

  if (c.memberType === "premium") {
    score += policy.premiumBoostWeight;
    reasons.push(REASON_LABELS.premium);
  }
  if (c.isBusinessItem) {
    score += policy.businessBoostWeight;
    reasons.push(REASON_LABELS.business);
  }

  return { score: Math.round(score * 100) / 100, reasons };
}

function candidateToFeedItem(c: PersonalizedCandidate, reasonLabel: string, score: number): PersonalizedFeedItem {
  const locationLabel = [c.region, c.city, c.barangay].filter(Boolean).join(" · ") || "-";
  return {
    id: c.id,
    targetId: c.id,
    title: c.title,
    thumbnail: c.thumbnail,
    price: c.price,
    locationLabel,
    reasonLabel,
    score,
    category: c.category || undefined,
  };
}

export interface BuildPersonalizedFeedOptions {
  userId?: string;
  writeLog?: boolean;
  seenIds?: Set<string>;
}

export function buildPersonalizedFeedSections(
  policies: Array<PersonalizedFeedPolicy>,
  candidates: PersonalizedCandidate[],
  profile: UserBehaviorProfile,
  options: BuildPersonalizedFeedOptions = {}
): PersonalizedFeedResult[] {
  const { userId = "me", writeLog = false, seenIds = new Set<string>() } = options;
  const activePolicies = policies.filter((p) => p.isActive);
  const baseFiltered = candidates.filter(
    (c) => !excludeStatus.includes(c.status as (typeof excludeStatus)[number])
  );
  const results: PersonalizedFeedResult[] = [];
  const now = new Date().toISOString();

  for (const policy of activePolicies) {
    const sectionKey = policy.sectionKey;
    let sectionCandidates = [...baseFiltered];

    if (sectionKey === "category_based") {
      if (profile.favoriteCategories.length === 0 && profile.recentViewedCategories.length === 0) {
        sectionCandidates = [];
      } else {
        const prefCats = new Set([
          ...profile.favoriteCategories,
          ...profile.recentViewedCategories,
          ...profile.recentFavoritedCategories,
          ...profile.recentChattedCategories,
        ]);
        sectionCandidates = sectionCandidates.filter((c) => c.category && prefCats.has(c.category));
      }
    } else if (sectionKey === "interest_based") {
      if (profile.favoriteCategories.length === 0) sectionCandidates = [];
      else {
        sectionCandidates = sectionCandidates.filter(
          (c) => c.category && profile.favoriteCategories.includes(c.category)
        );
      }
    } else if (sectionKey === "recent_view_based") {
      if (profile.recentViewedCategories.length === 0) sectionCandidates = [];
      else {
        sectionCandidates = sectionCandidates.filter(
          (c) => c.category && profile.recentViewedCategories.includes(c.category)
        );
      }
    } else if (sectionKey === "recent_favorite_based") {
      if (profile.recentFavoritedCategories.length === 0) sectionCandidates = [];
      else {
        sectionCandidates = sectionCandidates.filter(
          (c) => c.category && profile.recentFavoritedCategories.includes(c.category)
        );
      }
    } else if (sectionKey === "recent_chat_based") {
      if (profile.recentChattedCategories.length === 0) sectionCandidates = [];
      else {
        sectionCandidates = sectionCandidates.filter(
          (c) => c.category && profile.recentChattedCategories.includes(c.category)
        );
      }
    }

    const withScores = sectionCandidates.map((c) => {
      const { score, reasons } = computePersonalizedScore(c, profile, policy, sectionKey);
      c.personalizedScore = score;
      c.personalizedReasons = reasons;
      return c;
    });
    withScores.sort((a, b) => (b.personalizedScore ?? 0) - (a.personalizedScore ?? 0));

    const beforeDedupe = withScores.length;
    const taken: PersonalizedCandidate[] = [];
    for (const c of withScores) {
      if (taken.length >= policy.maxItems) break;
      if (policy.dedupeEnabled && seenIds.has(c.id)) continue;
      taken.push(c);
      if (policy.dedupeEnabled) seenIds.add(c.id);
    }
    const dedupedCount = beforeDedupe - taken.length;
    const topReason = taken[0]?.personalizedReasons?.[0] ?? "";

    const items: PersonalizedFeedItem[] = taken.map((c) =>
      candidateToFeedItem(
        c,
        c.personalizedReasons?.length ? c.personalizedReasons[0]! : policy.sectionLabel,
        c.personalizedScore ?? 0
      )
    );

    results.push({ sectionKey, items, generatedAt: now });

    if (writeLog && items.length > 0) {
      addPersonalizedFeedLog({
        userId,
        sectionKey,
        candidateCount: sectionCandidates.length,
        finalCount: items.length,
        dedupedCount,
        topReason,
        createdAt: now,
        note: "개인화 피드 생성",
      });
    }
  }

  return results;
}

export function getReasonLabelForSection(
  sectionKey: PersonalizedSectionKey,
  reasons: string[]
): string {
  if (reasons.length > 0) return reasons[0];
  const fallback: Record<PersonalizedSectionKey, string> = {
    category_based: "자주 보는 카테고리예요",
    interest_based: "관심 카테고리예요",
    recent_view_based: "최근 본 상품과 비슷해요",
    recent_favorite_based: "찜한 상품과 비슷해요",
    recent_chat_based: "최근 대화한 상품과 비슷해요",
  };
  return fallback[sectionKey];
}
