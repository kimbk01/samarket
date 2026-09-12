import type { SupabaseClient } from "@supabase/supabase-js";
import { pickRandomAliasFromPool } from "@/lib/community-crawler/author-pool-store";
import {
  assignDisplayAuthorOnce,
  assignDisplayDateOnce,
  assignDisplayViewOnce,
} from "@/lib/community-crawler/core/assign-display-once";
import type {
  CommunityCrawlAuthorConfig,
  CommunityCrawlBoardRow,
  CommunityCrawlDateConfig,
  CommunityCrawlItemRow,
  CommunityCrawlSourceRow,
  CommunityCrawlViewConfig,
} from "@/lib/community-crawler/crawl-ssot";
import { loadReplacementRulesForBoard } from "@/lib/community-crawler/replacement/replacement-rule-store";
import { applyCommunityCrawlReplacementRules } from "@/lib/community-crawler/replacement/apply-replacement-rules";
import { rehostCommunityCrawlItemMedia } from "@/lib/community-crawler/media/rehost-item-media";
import { loadCanonicalPublishImagesFromItemMedia } from "@/lib/community-crawler/media/canonical-publish-images";
import {
  publishCommunityCrawlFullContent,
  type FullContentPublishResult,
} from "@/lib/community-crawler/publish-full-content";
import { getCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";

export type TransientItemPreview = {
  itemId: string;
  boardId: string;
  sourceId: string;
  canonicalUrl: string;
  sourceTitle: string;
  sourceBody: string;
  sourceAuthor: string | null;
  sourcePublishedAt: string | null;
  dibayTitle: string;
  dibayBody: string;
  displayAuthorName: string;
  displayAuthorAvatarUrl: string | null;
  displayDate: string;
  displayViewSeed: number;
  coverImageUrl: string | null;
  bodyImages: string[];
  publicAttributionMode: "VISIBLE" | "HIDDEN";
  attributionRequirement: "MANDATORY" | "DISCRETIONARY";
  topicId: string;
  topicName: string;
  isMaterialized: boolean;
};

/**
 * PURE READ preview: DB WRITE COUNT = 0.
 * Never mutates community_crawl_items, community_posts, or storage.
 */
export async function generateTransientItemPreview(
  sb: SupabaseClient,
  input: {
    item: CommunityCrawlItemRow;
    board: CommunityCrawlBoardRow;
    source: CommunityCrawlSourceRow;
  }
): Promise<TransientItemPreview> {
  const { item, board, source } = input;

  // Fetch topic name
  let topicName = "커뮤니티";
  const { data: topic } = await sb
    .from("community_topics")
    .select("name")
    .eq("id", board.dibay_topic_id)
    .maybeSingle();
  if (topic?.name) topicName = String(topic.name);

  // If item is already materialized, return its durable values
  if (item.persona_materialized_at && item.display_author_name) {
    return {
      itemId: item.id,
      boardId: board.id,
      sourceId: source.id,
      canonicalUrl: item.canonical_url,
      sourceTitle: item.source_title,
      sourceBody: item.source_body_normalized,
      sourceAuthor: item.source_author,
      sourcePublishedAt: item.source_published_at,
      dibayTitle: item.dibay_title || item.source_title,
      dibayBody: item.dibay_body || item.source_body_normalized,
      displayAuthorName: item.display_author_name,
      displayAuthorAvatarUrl: item.display_author_avatar_url,
      displayDate: item.display_date || item.created_at,
      displayViewSeed: item.display_view_seed,
      coverImageUrl: item.source_cover_url || item.source_cover_candidate_url,
      bodyImages: item.source_body_images,
      publicAttributionMode: board.public_attribution_mode ?? "VISIBLE",
      attributionRequirement: source.attribution_requirement ?? "DISCRETIONARY",
      topicId: board.dibay_topic_id,
      topicName,
      isMaterialized: true,
    };
  }

  // Transient author calculation
  let displayAuthorName = "DIBAY 에디터";
  let displayAuthorAvatarUrl: string | null = null;

  if (board.author_pool_id) {
    const alias = await pickRandomAliasFromPool(sb, board.author_pool_id);
    if (alias) {
      displayAuthorName = alias.aliasName;
      displayAuthorAvatarUrl = alias.avatarUrl;
    }
  } else {
    const authorRes = assignDisplayAuthorOnce({
      policy: board.author_policy,
      config: board.author_config as CommunityCrawlAuthorConfig,
      sourceAuthor: item.source_author,
    });
    if (authorRes.ok) {
      displayAuthorName = authorRes.displayName;
      displayAuthorAvatarUrl = authorRes.avatarUrl;
    }
  }

  // Transient date calculation
  const dateConfig = {
    ...(board.date_config as CommunityCrawlDateConfig),
    recent_min_days: board.date_recent_min_days ?? 3,
    recent_max_days: board.date_recent_max_days ?? 7,
  };
  const dateRes = assignDisplayDateOnce({
    policy: board.date_policy,
    config: dateConfig,
    sourceDateRaw: item.source_published_at,
  });
  const displayDate = dateRes.ok ? dateRes.displayDateIso : new Date().toISOString();

  // Transient view seed calculation
  const viewRes = assignDisplayViewOnce({
    policy: board.view_policy,
    config: board.view_config as CommunityCrawlViewConfig,
    sourceViewRaw: null,
  });
  const displayViewSeed = viewRes.ok ? viewRes.viewSeed : 150;

  // Transient replacement rules
  const rules = await loadReplacementRulesForBoard(sb, {
    sourceId: source.id,
    boardId: board.id,
  });
  const materialized = applyCommunityCrawlReplacementRules({
    sourceTitle: item.source_title,
    sourceBody: item.source_body_normalized,
    rules,
  });

  return {
    itemId: item.id,
    boardId: board.id,
    sourceId: source.id,
    canonicalUrl: item.canonical_url,
    sourceTitle: item.source_title,
    sourceBody: item.source_body_normalized,
    sourceAuthor: item.source_author,
    sourcePublishedAt: item.source_published_at,
    dibayTitle: materialized.dibay_title,
    dibayBody: materialized.dibay_body,
    displayAuthorName,
    displayAuthorAvatarUrl,
    displayDate,
    displayViewSeed,
    coverImageUrl: item.source_cover_url || item.source_cover_candidate_url,
    bodyImages: item.source_body_images,
    publicAttributionMode: board.public_attribution_mode ?? "VISIBLE",
    attributionRequirement: source.attribution_requirement ?? "DISCRETIONARY",
    topicId: board.dibay_topic_id,
    topicName,
    isMaterialized: false,
  };
}

export type MaterializeAndPublishResult =
  | {
      ok: true;
      communityPostId: string;
      postLinkId: string;
      itemId: string;
      initialViewSeed: number;
      displayAuthorName: string;
      displayDate: string;
      mediaDelta: number;
    }
  | {
      ok: false;
      error: string;
      detail?: string;
      httpStatus?: number;
    };

/**
 * Single canonical Materialize + Publish Writer SSOT.
 * Used by BOTH Manual Apply [DIBAY 적용] and AUTO crawl scheduler.
 * 1. Materializes persona ONCE (author, date, view seed, replacement) if not already done.
 * 2. Rehosts real media (sharp validated, >200px, no fake color tiles).
 * 3. Publishes to community_posts + post_links + community_post_images in one atomic RPC.
 */
export async function materializeAndPublishItem(
  sb: SupabaseClient,
  input: {
    item: CommunityCrawlItemRow;
    board: CommunityCrawlBoardRow;
    source: CommunityCrawlSourceRow;
    runId?: string | null;
  }
): Promise<MaterializeAndPublishResult> {
  const { board, source, runId = null } = input;
  let item = input.item;
  const now = new Date().toISOString();

  // Step 1: Materialize Persona ONCE if not yet materialized
  if (!item.persona_materialized_at || !item.display_author_name) {
    let displayAuthorName = "DIBAY 에디터";
    let displayAuthorAvatarUrl: string | null = null;

    if (board.author_pool_id) {
      const alias = await pickRandomAliasFromPool(sb, board.author_pool_id);
      if (alias) {
        displayAuthorName = alias.aliasName;
        displayAuthorAvatarUrl = alias.avatarUrl;
      }
    } else {
      const authorRes = assignDisplayAuthorOnce({
        policy: board.author_policy,
        config: board.author_config as CommunityCrawlAuthorConfig,
        sourceAuthor: item.source_author,
      });
      if (authorRes.ok) {
        displayAuthorName = authorRes.displayName;
        displayAuthorAvatarUrl = authorRes.avatarUrl;
      }
    }

    const dateConfig = {
      ...(board.date_config as CommunityCrawlDateConfig),
      recent_min_days: board.date_recent_min_days ?? 3,
      recent_max_days: board.date_recent_max_days ?? 7,
    };
    const dateRes = assignDisplayDateOnce({
      policy: board.date_policy,
      config: dateConfig,
      sourceDateRaw: item.source_published_at,
    });
    const displayDate = dateRes.ok ? dateRes.displayDateIso : now;

    const viewRes = assignDisplayViewOnce({
      policy: board.view_policy,
      config: board.view_config as CommunityCrawlViewConfig,
      sourceViewRaw: null,
    });
    const displayViewSeed = viewRes.ok ? viewRes.viewSeed : 150;

    const rules = await loadReplacementRulesForBoard(sb, {
      sourceId: source.id,
      boardId: board.id,
    });
    const materialized = applyCommunityCrawlReplacementRules({
      sourceTitle: item.source_title,
      sourceBody: item.source_body_normalized,
      rules,
    });

    const { data: updatedItem, error: updateErr } = await sb
      .from("community_crawl_items")
      .update({
        display_author_name: displayAuthorName,
        display_author_avatar_url: displayAuthorAvatarUrl,
        display_date: displayDate,
        display_view_seed: displayViewSeed,
        dibay_title: materialized.dibay_title,
        dibay_body: materialized.dibay_body,
        persona_materialized_at: now,
        status: "READY",
        updated_at: now,
      })
      .eq("id", item.id)
      .select("*")
      .single();

    if (updateErr || !updatedItem) {
      return {
        ok: false,
        error: updateErr?.message ?? "materialize_failed",
        httpStatus: 500,
      };
    }
    const fresh = await getCommunityCrawlItem(sb, item.id);
    if (fresh) item = fresh;
  }

  // Step 2: Media Rehost Pipeline
  await rehostCommunityCrawlItemMedia({
    sb,
    item,
    source,
    runId,
  });

  const canonicalImages = await loadCanonicalPublishImagesFromItemMedia(sb, item.id);
  if (board.media_required && canonicalImages.length === 0) {
    return {
      ok: false,
      error: "MEDIA_REQUIRED_IMAGE_MISSING",
      detail: "Board requires media, but no validated rehosted images available.",
      httpStatus: 400,
    };
  }

  // Step 3: Canonical Full Content Publish RPC
  const pubResult: FullContentPublishResult = await publishCommunityCrawlFullContent(sb, {
    boardId: board.id,
    canonicalUrl: item.canonical_url,
    sourcePostId: item.source_post_id,
    sourcePublishedAt: item.source_published_at,
    title: item.dibay_title || item.source_title,
    content: item.dibay_body || item.source_body_normalized,
    displayAuthorName: item.display_author_name ?? "DIBAY 에디터",
    displayAuthorAvatarUrl: item.display_author_avatar_url,
    createdAtIso: item.display_date,
    viewCount: item.display_view_seed,
    initialViewSeed: item.display_view_seed,
    publicAttributionMode: board.public_attribution_mode ?? "VISIBLE",
    images: canonicalImages,
  });

  if (!pubResult.ok) {
    return {
      ok: false,
      error: pubResult.error,
      detail: pubResult.detail,
      httpStatus: pubResult.httpStatus,
    };
  }

  // Mark item as published
  await sb
    .from("community_crawl_items")
    .update({
      status: "PUBLISHED",
      published_post_id: pubResult.communityPostId,
      updated_at: now,
    })
    .eq("id", item.id);

  return {
    ok: true,
    communityPostId: pubResult.communityPostId,
    postLinkId: pubResult.postLinkId,
    itemId: item.id,
    initialViewSeed: item.display_view_seed,
    displayAuthorName: item.display_author_name ?? "DIBAY 에디터",
    displayDate: item.display_date ?? now,
    mediaDelta: pubResult.mediaDelta,
  };
}
