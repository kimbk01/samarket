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
import { addPersonalizedFeedLog } from "./personalized-feed-generation-log";
import {
  personalizedFeedLogNote,
  personalizedFeedReasonLabel,
  personalizedFeedSectionFallbackLabel,
} from "./personalized-feed-i18n";

const excludeStatus = ["hidden", "blinded", "deleted"] as const;

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
      reasons.push(personalizedFeedReasonLabel("category_match"));
    }
  }

  const viewMatch = profile.recentViewedCategories.includes(c.category);
  if (viewMatch && (sectionKey === "recent_view_based" || sectionKey === "category_based")) {
    score += policy.recentViewWeight;
    reasons.push(personalizedFeedReasonLabel("recent_view_similar"));
  }
  const favMatch = profile.recentFavoritedCategories.includes(c.category);
  if (favMatch && (sectionKey === "recent_favorite_based" || sectionKey === "interest_based")) {
    score += policy.recentFavoriteWeight;
    reasons.push(personalizedFeedReasonLabel("recent_favorite_similar"));
  }
  const chatMatch = profile.recentChattedCategories.includes(c.category);
  if (chatMatch && (sectionKey === "recent_chat_based" || sectionKey === "category_based")) {
    score += policy.recentChatWeight;
    reasons.push(personalizedFeedReasonLabel("recent_chat_similar"));
  }

  if (sectionKey === "interest_based" && profile.favoriteCategories.includes(c.category)) {
    score += policy.categoryAffinityWeight * 0.5;
    reasons.push(personalizedFeedReasonLabel("interest_match"));
  }

  const sameRegion = c.region === profile.preferredRegion;
  if (sameRegion) score += policy.nearbyWeight;
  if (sameRegion && (c.city === profile.preferredCity || c.barangay === profile.preferredBarangay)) {
    reasons.push(personalizedFeedReasonLabel("nearby_popular"));
  }

  const daysAgo = (Date.now() - new Date(c.createdAt).getTime()) / 86400000;
  const recency = Math.max(0, 1 - daysAgo / 30);
  score += recency * policy.recencyWeight;

  if (c.memberType === "premium") {
    score += policy.premiumBoostWeight;
    reasons.push(personalizedFeedReasonLabel("premium"));
  }
  if (c.isBusinessItem) {
    score += policy.businessBoostWeight;
    reasons.push(personalizedFeedReasonLabel("business"));
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
        note: personalizedFeedLogNote(),
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
  return personalizedFeedSectionFallbackLabel(sectionKey);
}
