/**
 * V2-1 canonical FULL_CONTENT publish writer (operational).
 * Does not mutate source_* snapshot fields.
 * No community_post_images (V2-5). No point reward.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { findExistingCommunityCrawlPostLink } from "@/lib/community-crawler/manual-import-writer";
import { validateFullContentDraftForPublish } from "@/lib/community-crawler/publish-full-content-draft";
import { COMMUNITY_CRAWL_V2_PUBLISH_TARGET } from "@/lib/community-crawler/publish-mode";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";

export type FullContentPublishInput = {
  boardId: string;
  sourcePostId: string | null;
  canonicalUrl: string;
  sourcePublishedAt: string | null;
  title: string;
  content: string;
  displayAuthorName: string;
  displayAuthorAvatarUrl?: string | null;
  createdAtIso: string | null;
  viewCount: number;
  regionLabel?: string;
};

export type FullContentPublishResult =
  | {
      ok: true;
      communityPostId: string;
      postLinkId: string;
      originKind: "imported";
      publishMode: typeof COMMUNITY_CRAWL_V2_PUBLISH_TARGET;
      pointReward: 0;
      mediaDelta: 0;
      alreadyImported: false;
    }
  | {
      ok: false;
      error: string;
      httpStatus: number;
      communityPostId?: string;
      detail?: string;
    };

export async function publishCommunityCrawlFullContent(
  sb: SupabaseClient,
  input: FullContentPublishInput
): Promise<FullContentPublishResult> {
  const board = await getCommunityCrawlBoard(sb, input.boardId);
  if (!board) {
    return { ok: false, error: "board_not_found", httpStatus: 404 };
  }
  const source = await getCommunityCrawlSource(sb, board.source_id);
  if (!source) {
    return { ok: false, error: "source_not_found", httpStatus: 404 };
  }

  if (source.policy_status === "DISABLED") {
    return { ok: false, error: "source_policy_disabled", httpStatus: 400 };
  }
  if (source.status !== "ACTIVE") {
    return { ok: false, error: "source_not_active", httpStatus: 400 };
  }

  const draftCheck = validateFullContentDraftForPublish({
    draftTitle: input.title,
    draftContent: input.content,
  });
  if (!draftCheck.ok) {
    return { ok: false, error: draftCheck.error, httpStatus: 400 };
  }

  const principal = await loadCommunityImportPrincipalUserId(sb);
  if (!principal) {
    return { ok: false, error: "import_principal_missing", httpStatus: 500 };
  }

  const { data: topic, error: topicErr } = await sb
    .from("community_topics")
    .select("id, slug, section_id, name")
    .eq("id", board.dibay_topic_id)
    .maybeSingle();
  if (topicErr || !topic) {
    return { ok: false, error: "topic_not_found", httpStatus: 400 };
  }

  const topicId = String((topic as { id: string }).id);
  const topicSlug = String((topic as { slug: string }).slug || "").trim();
  const sectionId = String((topic as { section_id: string }).section_id || "").trim();
  if (!topicSlug || !sectionId) {
    return { ok: false, error: "topic_incomplete", httpStatus: 400 };
  }

  const { data: section, error: secErr } = await sb
    .from("community_sections")
    .select("id, slug")
    .eq("id", sectionId)
    .maybeSingle();
  if (secErr || !section) {
    return { ok: false, error: "section_not_found", httpStatus: 400 };
  }

  const existing = await findExistingCommunityCrawlPostLink(sb, {
    boardId: board.id,
    sourcePostId: input.sourcePostId,
    canonicalUrl: input.canonicalUrl,
  });
  if (existing) {
    return {
      ok: false,
      error: "already_imported",
      httpStatus: 409,
      communityPostId: existing.communityPostId,
    };
  }

  const title = input.title.trim();
  const content = input.content.trim();
  const displayAuthorName = input.displayAuthorName.trim();
  if (!displayAuthorName) {
    return { ok: false, error: "display_author_required", httpStatus: 400 };
  }

  const category = deriveCommunityPostCategoryBucket({
    topicOrCategoryRaw: topicSlug,
    isMeetup: false,
  });

  const payload = {
    board_id: board.id,
    source_post_id: input.sourcePostId?.trim() || null,
    canonical_url: input.canonicalUrl.trim(),
    source_published_at: input.sourcePublishedAt,
    principal_user_id: principal,
    section_id: String((section as { id: string }).id),
    section_slug: String((section as { slug: string }).slug),
    topic_id: topicId,
    topic_slug: topicSlug,
    title,
    content,
    summary: summarizeCommunityPostContent(content),
    region_label: (input.regionLabel ?? "필리핀").trim() || "필리핀",
    category,
    display_author_name: displayAuthorName,
    display_author_avatar_url: input.displayAuthorAvatarUrl?.trim() || null,
    created_at: input.createdAtIso,
    view_count: Math.max(0, Math.floor(Number(input.viewCount) || 0)),
  };

  const { data, error } = await sb.rpc("community_crawl_publish_full_content", {
    p_payload: payload,
  });

  if (error) {
    return {
      ok: false,
      error: "full_content_rpc_failed",
      httpStatus: 500,
      detail: error.message,
    };
  }

  const row = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (row.ok === true) {
    return {
      ok: true,
      communityPostId: String(row.community_post_id),
      postLinkId: String(row.post_link_id),
      originKind: "imported",
      publishMode: COMMUNITY_CRAWL_V2_PUBLISH_TARGET,
      pointReward: 0,
      mediaDelta: 0,
      alreadyImported: false,
    };
  }

  const err = String(row.error ?? "full_content_publish_failed");
  const httpStatus = typeof row.http_status === "number" ? row.http_status : 500;
  return {
    ok: false,
    error: err,
    httpStatus,
    communityPostId: row.community_post_id != null ? String(row.community_post_id) : undefined,
    detail: row.detail != null ? String(row.detail) : undefined,
  };
}

/** Intentionally never call community point reward from crawler publish. */
export const FULL_CONTENT_PUBLISH_POINT_REWARD_FORBIDDEN = true as const;
