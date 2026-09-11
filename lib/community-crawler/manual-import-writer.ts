/**
 * LEGACY runtime publish writer (REFERENCE_SUMMARY) — still called by items/[id]/publish until V2-1.
 * V2 operational TARGET = FULL_CONTENT (COMMUNITY_CRAWL_V2_PUBLISH_TARGET). Do not treat this as V2 SSOT.
 * Calls atomic RPC — no point reward, no media, no browser service role.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import {
  getCommunityCrawlBoard,
  getCommunityCrawlSource,
} from "@/lib/community-crawler/admin-crawl-store";
import { validateReferenceSummaryDraftForPublish } from "@/lib/community-crawler/manual-import-draft";
import { normalizeCommunityCrawlPublishMode } from "@/lib/community-crawler/publish-mode";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";

export type ManualImportPublishInput = {
  boardId: string;
  sourcePostId: string | null;
  canonicalUrl: string;
  sourcePublishedAt: string | null;
  /** External body — reference only; never written to community_posts. */
  sourceBodyMarkdown: string;
  title: string;
  content: string;
  displayAuthorName: string;
  displayAuthorAvatarUrl?: string | null;
  /** Override created_at; if null, IMPORT now. */
  createdAtIso: string | null;
  viewCount: number;
  regionLabel?: string;
};

export type ManualImportPublishResult =
  | {
      ok: true;
      communityPostId: string;
      postLinkId: string;
      originKind: "imported";
      publishMode: "REFERENCE_SUMMARY";
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

export async function findExistingCommunityCrawlPostLink(
  sb: SupabaseClient,
  input: { boardId: string; sourcePostId: string | null; canonicalUrl: string }
): Promise<{ communityPostId: string; linkId: string } | null> {
  const boardId = input.boardId.trim();
  const sourcePostId = input.sourcePostId?.trim() || null;
  const canonicalUrl = input.canonicalUrl.trim();
  if (!boardId || (!sourcePostId && !canonicalUrl)) return null;

  if (sourcePostId) {
    const { data } = await sb
      .from("community_crawl_post_links")
      .select("id, community_post_id")
      .eq("board_id", boardId)
      .eq("source_post_id", sourcePostId)
      .maybeSingle();
    if (data?.community_post_id) {
      return { communityPostId: String(data.community_post_id), linkId: String(data.id) };
    }
  }
  if (canonicalUrl) {
    const { data } = await sb
      .from("community_crawl_post_links")
      .select("id, community_post_id")
      .eq("board_id", boardId)
      .eq("canonical_url", canonicalUrl)
      .maybeSingle();
    if (data?.community_post_id) {
      return { communityPostId: String(data.community_post_id), linkId: String(data.id) };
    }
  }
  return null;
}

export async function publishCommunityManualImportReferenceSummary(
  sb: SupabaseClient,
  input: ManualImportPublishInput
): Promise<ManualImportPublishResult> {
  const board = await getCommunityCrawlBoard(sb, input.boardId);
  if (!board) {
    return { ok: false, error: "board_not_found", httpStatus: 404 };
  }
  const source = await getCommunityCrawlSource(sb, board.source_id);
  if (!source) {
    return { ok: false, error: "source_not_found", httpStatus: 404 };
  }

  const publishMode = normalizeCommunityCrawlPublishMode(source.publish_mode);
  if (publishMode !== "REFERENCE_SUMMARY") {
    return { ok: false, error: "publish_mode_unsupported", httpStatus: 400 };
  }
  if (source.policy_status === "DISABLED") {
    return { ok: false, error: "source_policy_disabled", httpStatus: 400 };
  }
  if (source.status !== "ACTIVE") {
    return { ok: false, error: "source_not_active", httpStatus: 400 };
  }

  const draftCheck = validateReferenceSummaryDraftForPublish({
    draftTitle: input.title,
    draftContent: input.content,
    sourceBodyMarkdown: input.sourceBodyMarkdown,
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

  const { data, error } = await sb.rpc("community_crawl_manual_import_reference_summary", {
    p_payload: payload,
  });

  if (error) {
    return {
      ok: false,
      error: "manual_import_rpc_failed",
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
      publishMode: "REFERENCE_SUMMARY",
      pointReward: 0,
      mediaDelta: 0,
      alreadyImported: false,
    };
  }

  const err = String(row.error ?? "manual_import_failed");
  const httpStatus = typeof row.http_status === "number" ? row.http_status : 500;
  return {
    ok: false,
    error: err,
    httpStatus,
    communityPostId: row.community_post_id != null ? String(row.community_post_id) : undefined,
    detail: row.detail != null ? String(row.detail) : undefined,
  };
}

/** Intentionally never call community point reward bridge from Manual Import. */
export const MANUAL_IMPORT_POINT_REWARD_FORBIDDEN = true as const;
