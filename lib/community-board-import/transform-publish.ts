/**
 * ONE transform + Preview/Publish contract for board import.
 *
 * PREVIEW: persist=false → no Community write, no published_post_id, no persona DB consume
 * PUBLISH: persist=true → rehost → materialize ONCE → board_import_publish_article RPC
 *
 * Preview and Publish share applyBoardImportReplacement + document→markdown.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { articleDocumentStructureKey } from "@/lib/community-board-import/article-document";
import { articleDocumentToCommunityMarkdown } from "@/lib/community-board-import/document-to-markdown";
import { pickDisplayDateOnce } from "@/lib/community-board-import/date-seed";
import { makeFailureAudit, type BoardImportFailureStage } from "@/lib/community-board-import/failure-audit";
import {
  applyBoardImportReplacement,
  type BoardImportReplacementRule,
} from "@/lib/community-board-import/replacement";
import { rehostArticleDocumentImages } from "@/lib/community-board-import/rehost-document-images";
import type { BoardImportArticleRow, BoardImportSourceRow } from "@/lib/community-board-import/store";
import { pickInitialViewSeed } from "@/lib/community-board-import/view-seed";
import { loadCommunityImportPrincipalUserId } from "@/lib/community/community-import-principal";
import { pickRandomAliasFromPool } from "@/lib/community-crawler/author-pool-store";
import { deriveCommunityPostCategoryBucket } from "@/lib/neighborhood/derive-community-post-category-bucket";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";

export type BoardImportPublishPreview = {
  articleId: string;
  dibayTitle: string;
  dibayContent: string;
  structureKey: string;
  imageCount: number;
  /** Ephemeral — preview only; not written to DB. */
  previewAuthorName: string | null;
  previewDisplayDate: string | null;
  previewViewSeed: number | null;
  targetTopicId: string | null;
  targetTopicName: string | null;
  persist: false;
  communityWrite: 0;
};

export type BoardImportPublishOk = {
  ok: true;
  articleId: string;
  communityPostId: string;
  alreadyPublished: boolean;
  dibayTitle: string;
  dibayContent: string;
  displayAuthorName: string;
  displayDate: string;
  initialViewSeed: number;
  communityHref: string;
};

export type BoardImportPublishFail = {
  ok: false;
  articleId: string;
  failure_stage: BoardImportFailureStage;
  failure_code: string;
  failure_message: string;
};

async function loadReplacementRules(
  sb: SupabaseClient,
  sourceBoardId: string
): Promise<BoardImportReplacementRule[]> {
  const { data, error } = await sb
    .from("board_import_replacement_rules")
    .select("*")
    .eq("source_board_id", sourceBoardId)
    .order("priority", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    from_text: String(r.from_text ?? ""),
    to_text: String(r.to_text ?? ""),
    apply_title: r.apply_title !== false,
    apply_body: r.apply_body !== false,
    priority: typeof r.priority === "number" ? r.priority : 100,
    enabled: r.enabled !== false,
  }));
}

const PUBLISH_PEER_WAIT_MS = 120_000;
const PUBLISH_PEER_POLL_MS = 400;

async function clearPublishInflight(sb: SupabaseClient, articleId: string): Promise<void> {
  await sb
    .from("board_import_articles")
    .update({ publish_inflight_at: null, updated_at: new Date().toISOString() })
    .eq("id", articleId)
    .not("publish_inflight_at", "is", null);
}

async function alreadyPublishedOkFromRow(
  articleId: string,
  row: {
    published_post_id: string;
    display_author_name?: string | null;
    display_date?: string | null;
    initial_view_seed?: number | null;
    dibay_title?: string | null;
    source_title?: string | null;
  }
): Promise<BoardImportPublishOk> {
  return {
    ok: true,
    articleId,
    communityPostId: row.published_post_id,
    alreadyPublished: true,
    dibayTitle: String(row.dibay_title || row.source_title || ""),
    dibayContent: "",
    displayAuthorName: row.display_author_name ?? "",
    displayDate: row.display_date ?? "",
    initialViewSeed: row.initial_view_seed ?? 0,
    communityHref: `/philife/${row.published_post_id}`,
  };
}

async function loadAlreadyPublishedOk(
  sb: SupabaseClient,
  articleId: string
): Promise<BoardImportPublishOk | null> {
  const { data } = await sb
    .from("board_import_articles")
    .select(
      "published_post_id, display_author_name, display_date, initial_view_seed, dibay_title, source_title"
    )
    .eq("id", articleId)
    .maybeSingle();
  const postId = data?.published_post_id ? String(data.published_post_id) : "";
  if (!postId) return null;
  return alreadyPublishedOkFromRow(articleId, {
    published_post_id: postId,
    display_author_name: data?.display_author_name as string | null | undefined,
    display_date: data?.display_date as string | null | undefined,
    initial_view_seed: data?.initial_view_seed as number | null | undefined,
    dibay_title: data?.dibay_title as string | null | undefined,
    source_title: data?.source_title as string | null | undefined,
  });
}

async function waitForPeerPublication(
  sb: SupabaseClient,
  articleId: string
): Promise<BoardImportPublishOk | null> {
  const deadline = Date.now() + PUBLISH_PEER_WAIT_MS;
  while (Date.now() < deadline) {
    const existing = await loadAlreadyPublishedOk(sb, articleId);
    if (existing) return existing;
    await new Promise((r) => setTimeout(r, PUBLISH_PEER_POLL_MS));
  }
  return loadAlreadyPublishedOk(sb, articleId);
}

/**
 * Serialize media rehost: only one publisher claims; peer waits for existing publication.
 * FIRST DIVERGENCE fix — race loser must not surface media_upload_failed while winner still rehosts.
 */
async function claimOrAwaitExistingPublication(
  sb: SupabaseClient,
  articleId: string
): Promise<
  | { kind: "claimed" }
  | { kind: "already"; ok: BoardImportPublishOk }
  | { kind: "fail"; fail: BoardImportPublishFail }
> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await sb.rpc("board_import_claim_publish", {
      p_article_id: articleId,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("board_import_claim_publish") || msg.includes("schema cache") || msg.includes("does not exist")) {
        // Migration not applied yet — fall through without claim (legacy path).
        return { kind: "claimed" };
      }
      return {
        kind: "fail",
        fail: {
          ok: false,
          articleId,
          failure_stage: "PUBLISH",
          failure_code: "claim_rpc_failed",
          failure_message: "게시 잠금에 실패했습니다.",
        },
      };
    }
    const rpc = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    if (rpc.ok !== true) {
      return {
        kind: "fail",
        fail: {
          ok: false,
          articleId,
          failure_stage: "PUBLISH",
          failure_code: String(rpc.error ?? "claim_failed"),
          failure_message: "게시 잠금에 실패했습니다.",
        },
      };
    }
    const status = String(rpc.status ?? "");
    if (status === "claimed") return { kind: "claimed" };
    if (status === "already_published") {
      const postId = String(rpc.community_post_id ?? "").trim();
      if (!postId) {
        return {
          kind: "fail",
          fail: {
            ok: false,
            articleId,
            failure_stage: "PUBLISH_LINK",
            failure_code: "orphan_publish_link",
            failure_message: "게시 링크는 있으나 Community 글이 없습니다. 운영 확인이 필요합니다.",
          },
        };
      }
      return {
        kind: "already",
        ok: await alreadyPublishedOkFromRow(articleId, {
          published_post_id: postId,
          display_author_name: (rpc.display_author_name as string | null) ?? "",
          display_date: (rpc.display_date as string | null) ?? "",
          initial_view_seed:
            typeof rpc.initial_view_seed === "number" ? rpc.initial_view_seed : Number(rpc.initial_view_seed ?? 0),
          dibay_title: (rpc.dibay_title as string | null) ?? "",
        }),
      };
    }
    if (status === "peer_inflight") {
      const peer = await waitForPeerPublication(sb, articleId);
      if (peer) return { kind: "already", ok: peer };
      // Peer abandoned or stale — retry claim.
      continue;
    }
    return {
      kind: "fail",
      fail: {
        ok: false,
        articleId,
        failure_stage: "PUBLISH",
        failure_code: "claim_unknown_status",
        failure_message: "게시 잠금 상태를 확인할 수 없습니다.",
      },
    };
  }
  return {
    kind: "fail",
    fail: {
      ok: false,
      articleId,
      failure_stage: "PUBLISH",
      failure_code: "concurrent_publish_timeout",
      failure_message: "다른 게시 요청 대기 시간이 초과되었습니다.",
    },
  };
}

async function recordArticleFailure(
  sb: SupabaseClient,
  articleId: string,
  stage: BoardImportFailureStage,
  code: string,
  message: string
): Promise<BoardImportPublishFail> {
  const audit = makeFailureAudit({ stage, code, message });
  await sb
    .from("board_import_articles")
    .update({
      failure_stage: audit.failure_stage,
      failure_code: audit.failure_code,
      failure_message: audit.failure_message,
      failed_at: audit.failed_at,
      publish_inflight_at: null,
      updated_at: audit.failed_at,
    })
    .eq("id", articleId)
    .is("published_post_id", null);
  return {
    ok: false,
    articleId,
    failure_stage: audit.failure_stage,
    failure_code: audit.failure_code,
    failure_message: audit.failure_message,
  };
}

function runSharedTransform(input: {
  article: BoardImportArticleRow;
  rules: BoardImportReplacementRule[];
}): { dibayTitle: string; dibayContent: string; structureKey: string; imageCount: number } {
  const { dibayTitle, dibayDocument } = applyBoardImportReplacement({
    sourceTitle: input.article.source_title || input.article.source_document.title,
    sourceDocument: input.article.source_document,
    rules: input.rules,
  });
  const structureKey = articleDocumentStructureKey(dibayDocument);
  const { content, imageUrlsInOrder } = articleDocumentToCommunityMarkdown(dibayDocument);
  return {
    dibayTitle,
    dibayContent: content,
    structureKey,
    imageCount: imageUrlsInOrder.length,
  };
}

/**
 * Preview: same transform as publish. persist=false. Community write = 0.
 * Does not consume author pool assignment into DB.
 */
export async function previewBoardImportArticle(input: {
  sb: SupabaseClient;
  articleId: string;
}): Promise<
  | { ok: true; preview: BoardImportPublishPreview }
  | BoardImportPublishFail
> {
  const { sb, articleId } = input;
  const { data: article, error: aErr } = await sb
    .from("board_import_articles")
    .select("*")
    .eq("id", articleId)
    .maybeSingle();
  if (aErr || !article) {
    return {
      ok: false,
      articleId,
      failure_stage: "PUBLISH",
      failure_code: "article_not_found",
      failure_message: "게시글을 찾을 수 없습니다.",
    };
  }
  const row = article as BoardImportArticleRow;

  const { data: source } = await sb
    .from("board_import_sources")
    .select("*")
    .eq("id", row.source_board_id)
    .maybeSingle();
  const sourceRow = source as BoardImportSourceRow | null;

  let rules: BoardImportReplacementRule[] = [];
  try {
    rules = await loadReplacementRules(sb, row.source_board_id);
  } catch {
    return {
      ok: false,
      articleId,
      failure_stage: "TRANSFORM",
      failure_code: "rules_load_failed",
      failure_message: "치환 규칙을 불러오지 못했습니다.",
    };
  }

  let transformed;
  try {
    transformed = runSharedTransform({ article: row, rules });
  } catch {
    return {
      ok: false,
      articleId,
      failure_stage: "TRANSFORM",
      failure_code: "transform_failed",
      failure_message: "본문 변환에 실패했습니다.",
    };
  }

  if (!transformed.dibayTitle.trim() || transformed.dibayContent.trim().length < 20) {
    return {
      ok: false,
      articleId,
      failure_stage: "TRANSFORM",
      failure_code: "body_too_short",
      failure_message: "변환 후 본문이 너무 짧습니다.",
    };
  }

  let previewAuthorName: string | null = null;
  if (sourceRow?.author_pool_id) {
    const alias = await pickRandomAliasFromPool(sb, sourceRow.author_pool_id);
    previewAuthorName = alias?.aliasName ?? null;
  }

  const previewDisplayDate = sourceRow
    ? pickDisplayDateOnce({
        minDays: sourceRow.date_recent_min_days,
        maxDays: sourceRow.date_recent_max_days,
      })
    : null;
  const previewViewSeed = sourceRow
    ? pickInitialViewSeed({ min: sourceRow.view_seed_min, max: sourceRow.view_seed_max })
    : null;

  let targetTopicName: string | null = null;
  if (sourceRow?.target_topic_id) {
    const { data: topic } = await sb
      .from("community_topics")
      .select("name")
      .eq("id", sourceRow.target_topic_id)
      .maybeSingle();
    targetTopicName = topic ? String((topic as { name: string }).name) : null;
  }

  return {
    ok: true,
    preview: {
      articleId,
      dibayTitle: transformed.dibayTitle,
      dibayContent: transformed.dibayContent,
      structureKey: transformed.structureKey,
      imageCount: transformed.imageCount,
      previewAuthorName,
      previewDisplayDate,
      previewViewSeed,
      targetTopicId: sourceRow?.target_topic_id ?? null,
      targetTopicName,
      persist: false,
      communityWrite: 0,
    },
  };
}

/**
 * Publish: same transform → rehost → materialize ONCE → atomic RPC.
 */
export async function publishBoardImportArticle(input: {
  sb: SupabaseClient;
  articleId: string;
}): Promise<BoardImportPublishOk | BoardImportPublishFail> {
  const { sb, articleId } = input;

  const { data: article, error: aErr } = await sb
    .from("board_import_articles")
    .select("*")
    .eq("id", articleId)
    .maybeSingle();
  if (aErr || !article) {
    return {
      ok: false,
      articleId,
      failure_stage: "PUBLISH",
      failure_code: "article_not_found",
      failure_message: "게시글을 찾을 수 없습니다.",
    };
  }
  const row = article as BoardImportArticleRow & {
    display_author_name?: string | null;
    display_date?: string | null;
    initial_view_seed?: number | null;
  };

  if (row.published_post_id) {
    const { data: existing } = await sb
      .from("community_posts")
      .select("id")
      .eq("id", row.published_post_id)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        articleId,
        communityPostId: row.published_post_id,
        alreadyPublished: true,
        dibayTitle: row.source_title,
        dibayContent: "",
        displayAuthorName: row.display_author_name ?? "",
        displayDate: row.display_date ?? "",
        initialViewSeed: row.initial_view_seed ?? 0,
        communityHref: `/philife/${row.published_post_id}`,
      };
    }
    return recordArticleFailure(
      sb,
      articleId,
      "PUBLISH_LINK",
      "orphan_publish_link",
      "게시 링크는 있으나 Community 글이 없습니다. 운영 확인이 필요합니다."
    );
  }

  const { data: source, error: sErr } = await sb
    .from("board_import_sources")
    .select("*")
    .eq("id", row.source_board_id)
    .maybeSingle();
  if (sErr || !source) {
    return recordArticleFailure(sb, articleId, "TARGET", "source_not_found", "SOURCE 게시판을 찾을 수 없습니다.");
  }
  const sourceRow = source as BoardImportSourceRow;

  if (!sourceRow.target_topic_id) {
    return recordArticleFailure(sb, articleId, "TARGET", "target_missing", "DIBAY TARGET이 지정되지 않았습니다.");
  }

  const { data: topic, error: topicErr } = await sb
    .from("community_topics")
    .select("id, slug, section_id, name")
    .eq("id", sourceRow.target_topic_id)
    .maybeSingle();
  if (topicErr || !topic) {
    return recordArticleFailure(sb, articleId, "TARGET", "topic_not_found", "TARGET 토픽이 유효하지 않습니다.");
  }
  const topicId = String((topic as { id: string }).id);
  const topicSlug = String((topic as { slug: string }).slug || "").trim();
  const sectionId = String((topic as { section_id: string }).section_id || "").trim();
  if (!topicSlug || !sectionId) {
    return recordArticleFailure(sb, articleId, "TARGET", "topic_incomplete", "TARGET 토픽 정보가 불완전합니다.");
  }

  const { data: section, error: secErr } = await sb
    .from("community_sections")
    .select("id, slug")
    .eq("id", sectionId)
    .maybeSingle();
  if (secErr || !section) {
    return recordArticleFailure(sb, articleId, "TARGET", "section_not_found", "TARGET 섹션을 찾을 수 없습니다.");
  }

  let rules: BoardImportReplacementRule[] = [];
  try {
    rules = await loadReplacementRules(sb, row.source_board_id);
  } catch {
    return recordArticleFailure(sb, articleId, "TRANSFORM", "rules_load_failed", "치환 규칙을 불러오지 못했습니다.");
  }

  const { dibayTitle, dibayDocument } = applyBoardImportReplacement({
    sourceTitle: row.source_title || row.source_document.title,
    sourceDocument: row.source_document,
    rules,
  });
  const structureBefore = articleDocumentStructureKey(dibayDocument);

  const claim = await claimOrAwaitExistingPublication(sb, articleId);
  if (claim.kind === "already") return claim.ok;
  if (claim.kind === "fail") return claim.fail;

  const rehosted = await rehostArticleDocumentImages({
    sb,
    articleId,
    document: dibayDocument,
  });
  if (!rehosted.ok) {
    const peer = await loadAlreadyPublishedOk(sb, articleId);
    if (peer) {
      await clearPublishInflight(sb, articleId);
      return peer;
    }
    return recordArticleFailure(
      sb,
      articleId,
      "MEDIA",
      rehosted.error,
      "이미지 재호스팅에 실패했습니다."
    );
  }
  if (rehosted.structureKey !== structureBefore) {
    const peer = await loadAlreadyPublishedOk(sb, articleId);
    if (peer) {
      await clearPublishInflight(sb, articleId);
      return peer;
    }
    return recordArticleFailure(
      sb,
      articleId,
      "MEDIA",
      "document_order_changed",
      "본문 이미지 순서가 변경되었습니다."
    );
  }

  const { content: dibayContent } = articleDocumentToCommunityMarkdown(rehosted.document);
  if (!dibayTitle.trim() || dibayContent.trim().length < 20) {
    return recordArticleFailure(
      sb,
      articleId,
      "TRANSFORM",
      "body_too_short",
      "변환 후 본문이 너무 짧습니다."
    );
  }

  if (!sourceRow.author_pool_id) {
    return recordArticleFailure(
      sb,
      articleId,
      "AUTHOR",
      "author_pool_required",
      "작성자 풀이 지정되지 않았습니다."
    );
  }
  const alias = await pickRandomAliasFromPool(sb, sourceRow.author_pool_id);
  if (!alias) {
    return recordArticleFailure(
      sb,
      articleId,
      "AUTHOR",
      "author_pool_empty",
      "활성 Alias가 없습니다. 작성자 풀에 Alias를 추가하세요."
    );
  }

  const displayDate = pickDisplayDateOnce({
    minDays: sourceRow.date_recent_min_days,
    maxDays: sourceRow.date_recent_max_days,
  });
  const initialViewSeed = pickInitialViewSeed({
    min: sourceRow.view_seed_min,
    max: sourceRow.view_seed_max,
  });

  const principal = await loadCommunityImportPrincipalUserId(sb);
  if (!principal) {
    return recordArticleFailure(
      sb,
      articleId,
      "COMMUNITY_WRITE",
      "import_principal_missing",
      "Community import principal이 설정되지 않았습니다."
    );
  }

  const category = deriveCommunityPostCategoryBucket({
    topicOrCategoryRaw: topicSlug,
    isMeetup: false,
  });

  const images = rehosted.images.map((img) => ({
    image_url: img.imageUrl,
    storage_path: img.storagePath,
    sort_order: img.sortOrder,
  }));

  const payload = {
    article_id: articleId,
    principal_user_id: principal,
    section_id: String((section as { id: string }).id),
    section_slug: String((section as { slug: string }).slug),
    topic_id: topicId,
    topic_slug: topicSlug,
    title: dibayTitle.trim(),
    content: dibayContent.trim(),
    summary: summarizeCommunityPostContent(dibayContent),
    region_label: "필리핀",
    category,
    display_author_name: alias.aliasName,
    display_author_avatar_url: alias.avatarUrl,
    created_at: displayDate,
    view_count: initialViewSeed,
    initial_view_seed: initialViewSeed,
    images,
  };

  const { data, error } = await sb.rpc("board_import_publish_article", {
    p_payload: payload,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (msg.includes("board_import_publish_article") || msg.includes("schema cache") || msg.includes("does not exist")) {
      return recordArticleFailure(
        sb,
        articleId,
        "COMMUNITY_WRITE",
        "publish_rpc_missing",
        "게시 RPC가 아직 DB에 없습니다. migration 적용이 필요합니다."
      );
    }
    return recordArticleFailure(
      sb,
      articleId,
      "COMMUNITY_WRITE",
      "full_content_rpc_failed",
      "Community 게시에 실패했습니다."
    );
  }

  const rpc = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (rpc.ok !== true) {
    return recordArticleFailure(
      sb,
      articleId,
      "COMMUNITY_WRITE",
      String(rpc.error ?? "community_write_failed"),
      "Community 글 작성에 실패했습니다."
    );
  }

  const communityPostId = String(rpc.community_post_id ?? "").trim();
  if (!communityPostId) {
    return recordArticleFailure(
      sb,
      articleId,
      "PUBLISH_LINK",
      "missing_post_id",
      "게시 후 Community post id가 없습니다."
    );
  }

  const { data: verify } = await sb
    .from("community_posts")
    .select("id")
    .eq("id", communityPostId)
    .maybeSingle();
  if (!verify) {
    return recordArticleFailure(
      sb,
      articleId,
      "PUBLISH_LINK",
      "post_not_readable",
      "Community 글을 확인할 수 없습니다."
    );
  }

  await clearPublishInflight(sb, articleId);

  return {
    ok: true,
    articleId,
    communityPostId,
    alreadyPublished: rpc.already_published === true,
    dibayTitle: dibayTitle.trim(),
    dibayContent: dibayContent.trim(),
    displayAuthorName: alias.aliasName,
    displayDate,
    initialViewSeed,
    communityHref: `/philife/${communityPostId}`,
  };
}

/** Sole publish authority for MANUAL Admin CTA and AUTO runner. */
export const boardImportCanonicalPublisher = {
  preview: previewBoardImportArticle,
  publish: publishBoardImportArticle,
} as const;
