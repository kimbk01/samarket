import type { SourceArticleIdentity } from "@/lib/community-board-import/source-article-identity";
import { canResolveSameArticle } from "@/lib/community-board-import/source-article-identity";

/**
 * ARTICLE DUPLICATE STATES — duplicate is NOT failure.
 *
 * same primary identity + same fingerprint → DUPLICATE_UNCHANGED
 * same primary identity + changed fingerprint → SOURCE_UPDATED
 * different primary identity + same fingerprint → FINGERPRINT_COLLISION (not SAME_ARTICLE)
 * SAME_ARTICLE only with redirect/canonical/stable-id link evidence
 */

export const ARTICLE_DEDUPE_OUTCOMES = [
  "NEW",
  "DUPLICATE_UNCHANGED",
  "SOURCE_UPDATED",
  "SAME_ARTICLE",
  "FINGERPRINT_COLLISION",
] as const;

export type ArticleDedupeOutcome = (typeof ARTICLE_DEDUPE_OUTCOMES)[number];

export const ARTICLE_ADMIN_LIST_KINDS = [
  "new",
  "published",
  "source_changed",
  "failed",
] as const;

export type ArticleAdminListKind = (typeof ARTICLE_ADMIN_LIST_KINDS)[number];

export type KnownSourceArticleRecord = {
  identity: SourceArticleIdentity;
  contentFingerprint: string;
  publishedPostId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceChangedAt: string | null;
};

export type ArticleDedupeDecision = {
  outcome: ArticleDedupeOutcome;
  forbidNewImportRow: boolean;
  forbidNewCommunityPost: boolean;
  existingPublishedPostId: string | null;
  adminHint: string | null;
};

export function decideArticleDedupe(input: {
  incoming: SourceArticleIdentity;
  /** Row matched by PRIMARY identity key lookup. */
  knownByPrimaryIdentity: KnownSourceArticleRecord | null;
  /**
   * Optional: another row with same fingerprint but different primary identity.
   * Must NOT auto-merge.
   */
  otherWithSameFingerprint?: KnownSourceArticleRecord | null;
  /**
   * Extra evidence that incoming URL/id resolves to a known row despite different primary key string
   * (redirect final URL / canonical link / stable id appear).
   */
  sameArticleEvidence?: {
    known: KnownSourceArticleRecord;
    redirectOrCanonicalToKnown: boolean;
    stableIdMatchesKnown?: boolean;
  } | null;
}): ArticleDedupeDecision {
  if (input.sameArticleEvidence) {
    const ok = canResolveSameArticle({
      primaryIdentityEquals:
        input.sameArticleEvidence.known.identity.stableArticleIdentity ===
        input.incoming.stableArticleIdentity,
      fingerprintEquals:
        input.sameArticleEvidence.known.contentFingerprint ===
        input.incoming.contentFingerprint,
      evidence: {
        redirectOrCanonicalToKnown: input.sameArticleEvidence.redirectOrCanonicalToKnown,
        stableIdMatchesKnown: input.sameArticleEvidence.stableIdMatchesKnown,
      },
    });
    if (ok) {
      return {
        outcome: "SAME_ARTICLE",
        forbidNewImportRow: true,
        forbidNewCommunityPost: true,
        existingPublishedPostId: input.sameArticleEvidence.known.publishedPostId,
        adminHint: null,
      };
    }
  }

  if (!input.knownByPrimaryIdentity) {
    if (
      input.otherWithSameFingerprint &&
      input.otherWithSameFingerprint.identity.stableArticleIdentity !==
        input.incoming.stableArticleIdentity
    ) {
      return {
        outcome: "FINGERPRINT_COLLISION",
        forbidNewImportRow: false,
        forbidNewCommunityPost: false,
        existingPublishedPostId: null,
        adminHint:
          "동일 본문 fingerprint가 다른 글 identity와 겹칩니다. 자동 병합하지 않았습니다.",
      };
    }
    return {
      outcome: "NEW",
      forbidNewImportRow: false,
      forbidNewCommunityPost: false,
      existingPublishedPostId: null,
      adminHint: null,
    };
  }

  const known = input.knownByPrimaryIdentity;
  const publishedId = known.publishedPostId;

  if (known.contentFingerprint === input.incoming.contentFingerprint) {
    return {
      outcome: "DUPLICATE_UNCHANGED",
      forbidNewImportRow: true,
      forbidNewCommunityPost: true,
      existingPublishedPostId: publishedId,
      adminHint: null,
    };
  }

  return {
    outcome: "SOURCE_UPDATED",
    forbidNewImportRow: true,
    forbidNewCommunityPost: true,
    existingPublishedPostId: publishedId,
    adminHint: "원문이 변경되었습니다",
  };
}

export function assertPublishLinkUniqueness(input: {
  existingPublishedPostId: string | null;
  attemptingNewPublish: boolean;
}): { allowNewPost: boolean; attachToPostId: string | null } {
  if (input.existingPublishedPostId) {
    return { allowNewPost: false, attachToPostId: input.existingPublishedPostId };
  }
  return { allowNewPost: input.attemptingNewPublish, attachToPostId: null };
}

export type CrawlDedupeSummary = {
  discovered: number;
  newCount: number;
  unchangedDuplicate: number;
  sourceUpdated: number;
  sameArticle: number;
  fingerprintCollision: number;
  newCommunityPosts: number;
};

export function summarizeCrawlDedupe(decisions: ArticleDedupeDecision[]): CrawlDedupeSummary {
  let newCount = 0;
  let unchangedDuplicate = 0;
  let sourceUpdated = 0;
  let sameArticle = 0;
  let fingerprintCollision = 0;
  let newCommunityPosts = 0;
  for (const d of decisions) {
    switch (d.outcome) {
      case "NEW":
        newCount += 1;
        if (!d.forbidNewCommunityPost) newCommunityPosts += 1;
        break;
      case "DUPLICATE_UNCHANGED":
        unchangedDuplicate += 1;
        break;
      case "SOURCE_UPDATED":
        sourceUpdated += 1;
        break;
      case "SAME_ARTICLE":
        sameArticle += 1;
        break;
      case "FINGERPRINT_COLLISION":
        fingerprintCollision += 1;
        if (!d.forbidNewCommunityPost) newCommunityPosts += 1;
        break;
      default:
        break;
    }
  }
  return {
    discovered: decisions.length,
    newCount,
    unchangedDuplicate,
    sourceUpdated,
    sameArticle,
    fingerprintCollision,
    newCommunityPosts,
  };
}

export function resolveArticleAdminListKind(input: {
  failure: boolean;
  publishedPostId: string | null;
  readableOnCommunity: boolean;
  sourceUpdated: boolean;
}): ArticleAdminListKind {
  if (input.failure) return "failed";
  if (input.publishedPostId && input.readableOnCommunity) {
    return input.sourceUpdated ? "source_changed" : "published";
  }
  if (input.sourceUpdated) return "source_changed";
  return "new";
}
