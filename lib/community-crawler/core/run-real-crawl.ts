import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGenericHtmlAdapterConfig } from "@/lib/community-crawler/adapters/generic-html-config";
import { parseDetailPage, parseListPage } from "@/lib/community-crawler/adapters/generic-html";
import {
  parseTravelPhilippinesDetailPage,
  parseTravelPhilippinesListPage,
  TRAVEL_PHILIPPINES_ADAPTER_KEY,
} from "@/lib/community-crawler/adapters/travel-philippines";
import { upsertCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";
import { classifyCrawlDetailPageHtml } from "@/lib/community-crawler/core/classify-detail-page";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import { resolveCommunityCrawlAdapterKey } from "@/lib/community-crawler/core/resolve-adapter-key";
import { insertCommunityCrawlRunEvent } from "@/lib/community-crawler/core/run-events";
import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
import { rehostCommunityCrawlItemMedia } from "@/lib/community-crawler/media/rehost-item-media";
import type {
  CommunityCrawlBoardRow,
  CommunityCrawlItemRow,
  CommunityCrawlRunKind,
  CommunityCrawlSourceRow,
} from "@/lib/community-crawler/crawl-ssot";

export type RealCrawlResult = {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  runId: string | null;
  boardId: string;
  sourceId: string;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  duplicateCount: number;
  skippedInvalidCount: number;
  failedCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  items: CommunityCrawlItemRow[];
  failures: Array<{ sourceUrl: string | null; errorCode: string; errorMessage: string }>;
  skippedInvalid: Array<{ sourceUrl: string | null; reason: string }>;
};

export async function runCommunityRealCrawl(input: {
  sb: SupabaseClient;
  board: CommunityCrawlBoardRow;
  source: CommunityCrawlSourceRow;
  runKind: CommunityCrawlRunKind;
  maxPostsOverride?: number;
}): Promise<RealCrawlResult> {
  const { sb, board, source, runKind } = input;
  const maxPosts = Math.min(
    Math.max(1, board.max_posts || 20),
    typeof input.maxPostsOverride === "number" ? Math.floor(input.maxPostsOverride) : board.max_posts || 20
  );

  let runId: string | null = null;
  const { data: runRow } = await sb
    .from("community_crawl_runs")
    .insert({
      board_id: board.id,
      run_kind: runKind === "TEST" ? "MANUAL" : runKind,
      status: "RUNNING",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runRow) runId = String((runRow as { id: string }).id);

  const failures: RealCrawlResult["failures"] = [];
  const skippedInvalid: RealCrawlResult["skippedInvalid"] = [];
  const items: CommunityCrawlItemRow[] = [];
  let fetchedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let duplicateCount = 0;
  let skippedInvalidCount = 0;
  let failedCount = 0;
  let fatalCode: string | null = null;
  let fatalMessage: string | null = null;

  try {
    const adapterKey = resolveCommunityCrawlAdapterKey(source, board);
    if (!adapterKey) {
      throw new CommunityCrawlError(
        "ADAPTER_UNSUPPORTED",
        `Unsupported custom adapter: ${source.adapter_key || board.crawl_mode}`
      );
    }
    const listFetch = await safeFetchHtml(board.list_url);
    let listItems: Array<{ detailUrl: string; sourcePostId: string | null }>;

    if (adapterKey === TRAVEL_PHILIPPINES_ADAPTER_KEY) {
      listItems = parseTravelPhilippinesListPage(listFetch.bodyText, listFetch.finalUrl).items;
    } else {
      const parsed = parseGenericHtmlAdapterConfig(board.adapter_config);
      if (!parsed.ok) throw new CommunityCrawlError("SELECTOR_CONFIG_INVALID", parsed.error);
      listItems = parseListPage(listFetch.bodyText, listFetch.finalUrl, parsed.config).items;
    }

    for (const listItem of listItems.slice(0, maxPosts)) {
      try {
        const detailFetch = await safeFetchHtml(listItem.detailUrl);
        fetchedCount += 1;

        const invalid = classifyCrawlDetailPageHtml(detailFetch.bodyText);
        if (invalid.kind === "SOURCE_INVALID") {
          skippedInvalidCount += 1;
          skippedInvalid.push({ sourceUrl: listItem.detailUrl, reason: invalid.reason });
          await insertCommunityCrawlRunEvent(sb, {
            runId,
            sourceId: source.id,
            boardId: board.id,
            sourcePostId: listItem.sourcePostId,
            canonicalUrl: listItem.detailUrl,
            phase: "VALIDATE",
            classification: "SKIPPED_INVALID",
            errorCode: invalid.reason,
            errorMessage: invalid.reason,
            httpStatus: detailFetch.status,
          });
          continue;
        }

        const detail =
          adapterKey === TRAVEL_PHILIPPINES_ADAPTER_KEY
            ? parseTravelPhilippinesDetailPage(detailFetch.bodyText, detailFetch.finalUrl)
            : (() => {
                const parsed = parseGenericHtmlAdapterConfig(board.adapter_config);
                if (!parsed.ok) throw new CommunityCrawlError("SELECTOR_CONFIG_INVALID", parsed.error);
                return parseDetailPage(detailFetch.bodyText, detailFetch.finalUrl, parsed.config);
              })();

        if (!detail.contentMarkdown || detail.contentMarkdown.trim().length < 40) {
          throw new CommunityCrawlError("CONTENT_MISSING", "body_too_short");
        }

        const upsert = await upsertCommunityCrawlItem({
          sb,
          board,
          source,
          runId,
          canonicalUrl: listItem.detailUrl,
          detail: {
            ...detail,
            sourcePostId: detail.sourcePostId ?? listItem.sourcePostId,
          },
        });

        const eventBase = {
          runId,
          sourceId: source.id,
          boardId: board.id,
          sourcePostId: detail.sourcePostId ?? listItem.sourcePostId,
          canonicalUrl: listItem.detailUrl,
        };

        if (
          detail.representativeImageUrl &&
          upsert.outcome !== "failed" &&
          upsert.item &&
          !upsert.item.source_cover_url
        ) {
          await insertCommunityCrawlRunEvent(sb, {
            ...eventBase,
            phase: "MEDIA_RESOLVE",
            classification: "MEDIA_INVALID",
            errorCode: "COVER_CANDIDATE_INVALID",
            errorMessage: upsert.item.source_cover_candidate_url || detail.representativeImageUrl,
          });
        }

        if (upsert.outcome === "inserted") {
          insertedCount += 1;
          items.push(upsert.item);
          await insertCommunityCrawlRunEvent(sb, {
            ...eventBase,
            phase: "UPSERT",
            classification: "INSERTED",
          });
        } else if (upsert.outcome === "updated") {
          updatedCount += 1;
          items.push(upsert.item);
          await insertCommunityCrawlRunEvent(sb, {
            ...eventBase,
            phase: "UPSERT",
            classification: "UPDATED",
          });
        } else if (upsert.outcome === "duplicate") {
          duplicateCount += 1;
          items.push(upsert.item);
          await insertCommunityCrawlRunEvent(sb, {
            ...eventBase,
            phase: "DEDUPE",
            classification: "DUPLICATE",
          });
        } else {
          failedCount += 1;
          failures.push({
            sourceUrl: upsert.canonicalUrl,
            errorCode: upsert.errorCode,
            errorMessage: upsert.errorMessage,
          });
          await insertCommunityCrawlRunEvent(sb, {
            ...eventBase,
            phase: "UPSERT",
            classification: "FAILED",
            errorCode: upsert.errorCode,
            errorMessage: upsert.errorMessage,
          });
        }

        if (upsert.outcome !== "failed" && upsert.item) {
          // PHASE C: media pipeline only; IMAGE_OPTIONAL — never fails the article upsert.
          await rehostCommunityCrawlItemMedia({
            sb,
            item: upsert.item,
            source,
            runId,
          });
        }
      } catch (e) {
        failedCount += 1;
        const err =
          e instanceof CommunityCrawlError
            ? e
            : new CommunityCrawlError("DETAIL_FETCH_FAILED", e instanceof Error ? e.message : String(e));
        failures.push({
          sourceUrl: listItem.detailUrl,
          errorCode: err.code,
          errorMessage: err.message,
        });
        await insertCommunityCrawlRunEvent(sb, {
          runId,
          sourceId: source.id,
          boardId: board.id,
          sourcePostId: listItem.sourcePostId,
          canonicalUrl: listItem.detailUrl,
          phase: "FETCH",
          classification: "FAILED",
          errorCode: err.code,
          errorMessage: err.message,
        });
      }
    }
  } catch (e) {
    const err =
      e instanceof CommunityCrawlError
        ? e
        : new CommunityCrawlError("DETAIL_FETCH_FAILED", e instanceof Error ? e.message : String(e));
    fatalCode = err.code;
    fatalMessage = err.message;
    failedCount += 1;
    await insertCommunityCrawlRunEvent(sb, {
      runId,
      sourceId: source.id,
      boardId: board.id,
      phase: "DISCOVER",
      classification: "FAILED",
      errorCode: err.code,
      errorMessage: err.message,
    });
  }

  let status: RealCrawlResult["status"] = "FAILED";
  if (failedCount === 0 && !fatalCode && (items.length > 0 || skippedInvalidCount > 0)) {
    status = "SUCCESS";
  } else if (items.length > 0 && failedCount > 0) {
    status = "PARTIAL";
  } else {
    status = "FAILED";
  }

  const now = new Date().toISOString();
  if (runId) {
    await sb
      .from("community_crawl_runs")
      .update({
        status,
        finished_at: now,
        fetched_count: fetchedCount,
        inserted_count: insertedCount,
        updated_count: updatedCount,
        duplicate_count: duplicateCount,
        skipped_invalid_count: skippedInvalidCount,
        failed_count: failedCount,
        error_code: fatalCode,
        error_message: fatalMessage,
      })
      .eq("id", runId);
  }

  const intervalMs = (board.crawl_interval_minutes ?? 60) * 60_000;
  await sb
    .from("community_crawl_boards")
    .update({
      last_run_at: now,
      last_success_at: status === "FAILED" ? board.last_success_at : now,
      last_error: status === "FAILED" ? fatalMessage ?? failures[0]?.errorMessage ?? "crawl_failed" : null,
      next_run_at: board.schedule_enabled ? new Date(Date.now() + intervalMs).toISOString() : board.next_run_at,
      updated_at: now,
    })
    .eq("id", board.id);

  return {
    status,
    runId,
    boardId: board.id,
    sourceId: source.id,
    fetchedCount,
    insertedCount,
    updatedCount,
    duplicateCount,
    skippedInvalidCount,
    failedCount,
    errorCode: fatalCode,
    errorMessage: fatalMessage,
    items,
    failures,
    skippedInvalid,
  };
}
