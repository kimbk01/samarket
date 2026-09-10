/**
 * STEP5 prepare drafts — import-time DIBAY display policy applied once per item.
 * Does not write community_posts. Media rehost blocked while REVIEW_REQUIRED.
 */

import type { TestCrawlPreviewItem } from "@/lib/community-crawler/core/preview-types";

/**
 * Client-safe path label only — do not import travel-philippines / safe-url here.
 * Value matches TRAVEL_PH_NEXT_DATA_COVER_PATH in adapters/travel-philippines.
 */
const TRAVEL_PH_NEXT_DATA_COVER_PATH =
  "props.pageProps.data.article.coverImage.url" as const;

export type MediaPublishPolicy = "PREVIEW_EXTERNAL_ONLY" | "BLOCKED_POLICY" | "ALLOWED_REHOST";

export type PreparedCrawlItem = {
  sourceUrl: string;
  sourcePostId: string | null;
  sourceTitle: string;
  /** Source-normalized body (reference). Not auto-published under REVIEW_REQUIRED. */
  sourceBodyMarkdown: string;
  contentPreview: string;
  /** Import-time DIBAY display author (RANDOM_POOL / FIXED / SOURCE once). */
  displayAuthorName: string;
  displayAuthorAvatarUrl: string | null;
  /** Import-time community_posts.created_at candidate. */
  displayDateIso: string | null;
  sourcePublishedAt: string | null;
  viewCount: number;
  representativeImageUrl: string | null;
  coverExtractionPath: typeof TRAVEL_PH_NEXT_DATA_COVER_PATH | "dom_selector" | "body_image" | "none";
  dibayTopicId: string;
  dibayTopicName: string | null;
  mediaPublish: MediaPublishPolicy;
  publicPublishBlocked: boolean;
  warnings: string[];
};

export function resolveMediaPublishPolicy(policyStatus: string): MediaPublishPolicy {
  if (policyStatus === "ALLOWED") return "ALLOWED_REHOST";
  if (policyStatus === "DISABLED") return "BLOCKED_POLICY";
  return "BLOCKED_POLICY";
}

export function buildPreparedCrawlItem(input: {
  preview: TestCrawlPreviewItem;
  policyStatus: string;
}): PreparedCrawlItem {
  const p = input.preview;
  const mediaPublish = resolveMediaPublishPolicy(input.policyStatus);
  const publicPublishBlocked = input.policyStatus !== "ALLOWED";
  let coverExtractionPath: PreparedCrawlItem["coverExtractionPath"] = "none";
  if (p.representativeImageUrl) {
    // Prefer classifying Next cover when URL looks like datocms (Travel PH covers).
    coverExtractionPath = /datocms-assets\.com/i.test(p.representativeImageUrl)
      ? TRAVEL_PH_NEXT_DATA_COVER_PATH
      : "dom_selector";
  }
  return {
    sourceUrl: p.sourceUrl,
    sourcePostId: p.sourcePostId,
    sourceTitle: p.title,
    sourceBodyMarkdown: p.contentMarkdown,
    contentPreview: p.contentPreview,
    displayAuthorName: p.authorDisplayName,
    displayAuthorAvatarUrl: null,
    displayDateIso: p.displayDateIso,
    sourcePublishedAt: p.sourcePublishedAt,
    viewCount:
      typeof p.viewCount === "number" && Number.isFinite(p.viewCount)
        ? Math.max(0, Math.floor(p.viewCount))
        : 0,
    representativeImageUrl: p.representativeImageUrl,
    coverExtractionPath,
    dibayTopicId: p.dibayTopicId,
    dibayTopicName: p.dibayTopicName,
    mediaPublish,
    publicPublishBlocked,
    warnings: [...p.warnings],
  };
}
