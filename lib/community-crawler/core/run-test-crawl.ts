import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGenericHtmlAdapterConfig } from "@/lib/community-crawler/adapters/generic-html-config";
import { parseDetailPage, parseListPage } from "@/lib/community-crawler/adapters/generic-html";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import {
  normalizePreviewAuthor,
  normalizePreviewDate,
  normalizePreviewView,
  parseSourceDate,
  parseSourceViewCount,
} from "@/lib/community-crawler/core/normalize";
import type {
  TestCrawlPreviewFailure,
  TestCrawlPreviewItem,
  TestCrawlResult,
} from "@/lib/community-crawler/core/preview-types";
import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
import type {
  CommunityCrawlAuthorConfig,
  CommunityCrawlBoardRow,
  CommunityCrawlDateConfig,
  CommunityCrawlSourceRow,
  CommunityCrawlViewConfig,
} from "@/lib/community-crawler/crawl-ssot";

/** TEST crawl default cap. STEP5 prepare may raise via options (≤ board.max_posts, ≤ 15). */
export const TEST_CRAWL_MAX_POSTS = 5;
export const TEST_CRAWL_MAX_PAGES = 1;
export const PREPARE_CRAWL_MAX_POSTS = 15;

const CONTENT_PREVIEW_LEN = 280;

export async function runCommunityTestCrawl(input: {
  sb: SupabaseClient;
  board: CommunityCrawlBoardRow;
  source: CommunityCrawlSourceRow;
  topicName: string | null;
  recordRun?: boolean;
  /** STEP5 prepare: raise cap (still capped by PREPARE_CRAWL_MAX_POSTS / board.max_posts). */
  maxPostsOverride?: number;
}): Promise<TestCrawlResult> {
  const { sb, board, source, topicName } = input;
  const recordRun = input.recordRun !== false;

  const base: Omit<
    TestCrawlResult,
    "status" | "previews" | "failures" | "fetchedCount" | "successCount" | "failedCount" | "errorCode" | "errorMessage" | "runId"
  > = {
    boardId: board.id,
    sourceId: source.id,
    listUrl: board.list_url,
    policyStatus: source.policy_status,
    policyNote:
      source.policy_status === "ALLOWED"
        ? "policy_allowed_for_future_import"
        : "TEST allowed for technical preview; import requires ALLOWED",
    insertedCount: 0,
    updatedCount: 0,
    postLinkWriteCount: 0,
    mediaWriteCount: 0,
  };

  let runId: string | null = null;
  if (recordRun) {
    const { data, error } = await sb
      .from("community_crawl_runs")
      .insert({
        board_id: board.id,
        run_kind: "TEST",
        status: "RUNNING",
        started_at: new Date().toISOString(),
        fetched_count: 0,
        inserted_count: 0,
        updated_count: 0,
        duplicate_count: 0,
        failed_count: 0,
      })
      .select("id")
      .single();
    if (!error && data) runId = String((data as { id: string }).id);
  }

  const finish = async (
    partial: Pick<
      TestCrawlResult,
      | "status"
      | "previews"
      | "failures"
      | "fetchedCount"
      | "successCount"
      | "failedCount"
      | "errorCode"
      | "errorMessage"
    >
  ): Promise<TestCrawlResult> => {
    if (runId) {
      await sb
        .from("community_crawl_runs")
        .update({
          status: partial.status,
          finished_at: new Date().toISOString(),
          fetched_count: partial.fetchedCount,
          inserted_count: 0,
          updated_count: 0,
          duplicate_count: 0,
          failed_count: partial.failedCount,
          error_code: partial.errorCode,
          error_message: partial.errorMessage,
        })
        .eq("id", runId);
      await sb
        .from("community_crawl_boards")
        .update({
          last_run_at: new Date().toISOString(),
          last_error: partial.status === "FAILED" ? partial.errorMessage : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", board.id);
    }
    return { ...base, runId, ...partial };
  };

  if (board.crawl_mode !== "generic_html" && source.crawler_type !== "generic_html") {
    return finish({
      status: "FAILED",
      previews: [],
      failures: [
        {
          ok: false,
          sourceUrl: board.list_url,
          errorCode: "ADAPTER_UNSUPPORTED",
          errorMessage: "Only generic_html is supported in STEP3",
        },
      ],
      fetchedCount: 0,
      successCount: 0,
      failedCount: 1,
      errorCode: "ADAPTER_UNSUPPORTED",
      errorMessage: "Only generic_html is supported in STEP3",
    });
  }

  const cfgParsed = parseGenericHtmlAdapterConfig(board.adapter_config);
  if (!cfgParsed.ok) {
    return finish({
      status: "FAILED",
      previews: [],
      failures: [
        {
          ok: false,
          sourceUrl: board.list_url,
          errorCode: "SELECTOR_CONFIG_INVALID",
          errorMessage: cfgParsed.error,
        },
      ],
      fetchedCount: 0,
      successCount: 0,
      failedCount: 1,
      errorCode: "SELECTOR_CONFIG_INVALID",
      errorMessage: cfgParsed.error,
    });
  }
  const config = cfgParsed.config;

  const requestedCap =
    typeof input.maxPostsOverride === "number" && Number.isFinite(input.maxPostsOverride)
      ? Math.max(1, Math.floor(input.maxPostsOverride))
      : TEST_CRAWL_MAX_POSTS;
  const hardCap = Math.min(PREPARE_CRAWL_MAX_POSTS, Math.max(1, board.max_posts || PREPARE_CRAWL_MAX_POSTS));
  const maxPosts = Math.min(hardCap, requestedCap);
  const maxPages = Math.min(TEST_CRAWL_MAX_PAGES, Math.max(1, board.max_pages || 1));

  const listItems: Array<{ detailUrl: string; sourcePostId: string | null }> = [];
  let pageUrl: string | null = board.list_url;
  let pages = 0;
  let hardError: CommunityCrawlError | null = null;

  try {
    while (pageUrl && pages < maxPages && listItems.length < maxPosts) {
      const listFetch = await safeFetchHtml(pageUrl);
      pages += 1;
      const parsed = parseListPage(listFetch.bodyText, listFetch.finalUrl, config);
      for (const it of parsed.items) {
        if (listItems.some((x) => x.detailUrl === it.detailUrl)) continue;
        listItems.push(it);
        if (listItems.length >= maxPosts) break;
      }
      pageUrl = pages < maxPages ? parsed.nextPageUrl : null;
    }
  } catch (e) {
    hardError =
      e instanceof CommunityCrawlError
        ? e
        : new CommunityCrawlError("HTTP_ERROR", e instanceof Error ? e.message : String(e));
  }

  if (hardError && listItems.length === 0) {
    return finish({
      status: "FAILED",
      previews: [],
      failures: [
        {
          ok: false,
          sourceUrl: board.list_url,
          errorCode: hardError.code,
          errorMessage: hardError.message,
        },
      ],
      fetchedCount: 0,
      successCount: 0,
      failedCount: 1,
      errorCode: hardError.code,
      errorMessage: hardError.message,
    });
  }

  const previews: TestCrawlPreviewItem[] = [];
  const failures: TestCrawlPreviewFailure[] = [];
  let fetchedCount = 0;

  for (const item of listItems.slice(0, maxPosts)) {
    try {
      const detailFetch = await safeFetchHtml(item.detailUrl);
      fetchedCount += 1;
      const detail = parseDetailPage(detailFetch.bodyText, detailFetch.finalUrl, config);
      const stableKey = `${board.id}:${detail.sourcePostId ?? item.detailUrl}`;
      const sourceDateIso = parseSourceDate(detail.dateRaw);
      const sourceView = parseSourceViewCount(detail.viewRaw);
      const author = normalizePreviewAuthor({
        policy: board.author_policy,
        config: board.author_config as CommunityCrawlAuthorConfig,
        sourceAuthor: detail.author,
        stableKey,
      });
      const date = normalizePreviewDate({
        policy: board.date_policy,
        config: board.date_config as CommunityCrawlDateConfig,
        sourceDateIso,
        stableKey,
      });
      const view = normalizePreviewView({
        policy: board.view_policy,
        config: board.view_config as CommunityCrawlViewConfig,
        sourceView,
        stableKey,
      });
      const warnings: string[] = [];
      if (date.warning) warnings.push(date.warning);
      if (view.warning) warnings.push(view.warning);
      if (author.note === "source_author_missing") warnings.push("AUTHOR_OPTIONAL_MISSING");

      const contentMarkdown = detail.contentMarkdown;
      const contentPreview =
        contentMarkdown.length > CONTENT_PREVIEW_LEN
          ? `${contentMarkdown.slice(0, CONTENT_PREVIEW_LEN).trim()}…`
          : contentMarkdown;

      previews.push({
        ok: true,
        title: detail.title,
        contentPreview,
        contentMarkdown,
        representativeImageUrl: detail.representativeImageUrl,
        bodyImageUrls: detail.bodyImageUrls,
        bodyImageCount: detail.bodyImageUrls.length,
        authorDisplayName: author.displayName,
        sourceAuthorRaw: detail.author,
        authorNote: author.note,
        displayDateIso: date.displayDateIso,
        sourcePublishedAt: date.sourcePublishedAt,
        viewCount: view.viewCount,
        sourceUrl: item.detailUrl,
        sourcePostId: detail.sourcePostId ?? item.sourcePostId,
        dibayTopicId: board.dibay_topic_id,
        dibayTopicName: topicName,
        imageMode: "PREVIEW_EXTERNAL_IMAGE_ONLY",
        warnings,
      });
    } catch (e) {
      const err =
        e instanceof CommunityCrawlError
          ? e
          : new CommunityCrawlError("DETAIL_FETCH_FAILED", e instanceof Error ? e.message : String(e));
      failures.push({
        ok: false,
        sourceUrl: item.detailUrl,
        errorCode: err.code === "HTTP_ERROR" || err.code === "FETCH_TIMEOUT" || err.code === "FETCH_BLOCKED"
          ? "DETAIL_FETCH_FAILED"
          : err.code,
        errorMessage: err.message,
      });
    }
  }

  const successCount = previews.length;
  const failedCount = failures.length;
  let status: TestCrawlResult["status"] = "FAILED";
  if (successCount > 0 && failedCount === 0) status = "SUCCESS";
  else if (successCount > 0 && failedCount > 0) status = "PARTIAL";
  else status = "FAILED";

  return finish({
    status,
    previews,
    failures,
    fetchedCount,
    successCount,
    failedCount,
    errorCode: status === "FAILED" && failures[0] ? failures[0].errorCode : null,
    errorMessage: status === "FAILED" && failures[0] ? failures[0].errorMessage : null,
  });
}
