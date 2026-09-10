/**
 * STEP4 REFERENCE_SUMMARY draft — no AI / no external body copy into DIBAY content.
 * Admin must edit before publish.
 */

import type { TestCrawlPreviewItem } from "@/lib/community-crawler/core/preview-types";
import { COMMUNITY_IMPORTED_AUTHOR_FALLBACK } from "@/lib/community/community-post-origin";

export type ManualImportSourceReference = {
  sourceName: string;
  sourceUrl: string;
  sourcePostId: string | null;
  sourceTitle: string;
  sourceBodyMarkdown: string;
  sourceAuthorDisplayName: string;
  sourcePublishedAt: string | null;
};

export type ManualImportDibayDraft = {
  title: string;
  content: string;
  topicId: string;
  topicName: string | null;
  displayAuthorName: string;
  displayAuthorAvatarUrl: string | null;
  /** Final community_posts.created_at candidate (board date policy already applied in preview). */
  displayDateIso: string | null;
  sourcePublishedAt: string | null;
  viewCount: number;
  publishMode: "REFERENCE_SUMMARY";
  /** True when draft body still empty — Admin must write DIBAY content. */
  requiresAdminBodyEdit: boolean;
  /** True when title still equals source title suggestion (Admin should confirm/edit). */
  titleStillSourceSuggestion: boolean;
};

export type ManualImportEditorState = {
  source: ManualImportSourceReference;
  draft: ManualImportDibayDraft;
};

/**
 * Build Import Editor initial state.
 * Does NOT put source body into draft.content (REFERENCE_SUMMARY).
 */
export function buildReferenceSummaryImportDraft(input: {
  preview: TestCrawlPreviewItem;
  sourceName: string;
}): ManualImportEditorState {
  const p = input.preview;
  const sourceBody = String(p.contentMarkdown ?? "").trim();
  const suggestedTitle = String(p.title ?? "").trim();
  return {
    source: {
      sourceName: input.sourceName,
      sourceUrl: p.sourceUrl,
      sourcePostId: p.sourcePostId,
      sourceTitle: suggestedTitle,
      sourceBodyMarkdown: sourceBody,
      sourceAuthorDisplayName:
        (p.sourceAuthorRaw && String(p.sourceAuthorRaw).trim()) ||
        COMMUNITY_IMPORTED_AUTHOR_FALLBACK,
      sourcePublishedAt: p.sourcePublishedAt,
    },
    draft: {
      title: suggestedTitle,
      content: "",
      topicId: p.dibayTopicId,
      topicName: p.dibayTopicName,
      displayAuthorName: p.authorDisplayName || COMMUNITY_IMPORTED_AUTHOR_FALLBACK,
      displayAuthorAvatarUrl: null,
      displayDateIso: p.displayDateIso,
      sourcePublishedAt: p.sourcePublishedAt,
      viewCount: typeof p.viewCount === "number" && Number.isFinite(p.viewCount) ? Math.max(0, Math.floor(p.viewCount)) : 0,
      publishMode: "REFERENCE_SUMMARY",
      requiresAdminBodyEdit: true,
      titleStillSourceSuggestion: Boolean(suggestedTitle),
    },
  };
}

/** Reject publish if Admin left body empty or pasted source full text unchanged. */
export function validateReferenceSummaryDraftForPublish(input: {
  draftTitle: string;
  draftContent: string;
  sourceBodyMarkdown: string;
}): { ok: true } | { ok: false; error: string } {
  const title = input.draftTitle.trim();
  const content = input.draftContent.trim();
  const sourceBody = input.sourceBodyMarkdown.trim();
  if (!title) return { ok: false, error: "title_required" };
  if (!content) return { ok: false, error: "dibay_body_required" };
  if (content.length < 20) return { ok: false, error: "dibay_body_too_short" };
  if (sourceBody && content === sourceBody) {
    return { ok: false, error: "source_body_copy_forbidden" };
  }
  // Soft block: near-identical long paste (first 400 chars of source)
  if (sourceBody.length >= 80) {
    const head = sourceBody.slice(0, 400);
    if (content.includes(head)) {
      return { ok: false, error: "source_body_copy_forbidden" };
    }
  }
  return { ok: true };
}
