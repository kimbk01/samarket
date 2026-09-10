/**
 * REAL crawl: fetch → parse → normalize → upsert durable community_crawl_items.
 * Distinct from TEST crawl (write 0 / preview only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGenericHtmlAdapterConfig } from "@/lib/community-crawler/adapters/generic-html-config";
import { parseDetailPage, parseListPage } from "@/lib/community-crawler/adapters/generic-html";
import {
  parseTravelPhilippinesDetailPage,
  parseTravelPhilippinesListPage,
  TRAVEL_PHILIPPINES_ADAPTER_KEY,
} from "@/lib/community-crawler/adapters/travel-philippines";
import { upsertCommunityCrawlItem } from "@/lib/community-crawler/crawl-item-store";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";
import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
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
  failedCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  items: CommunityCrawlItemRow[];
  failures: Array<{ sourceUrl: string | null; errorCode: string; errorMessage: string }>;
};

function resolveAdapterKey(source: CommunityCrawlSourceRow, board: CommunityCrawlBoardRow): string {
  const key = (source.adapter_key || board.crawl_mode || "").trim();
  if (key === TRAVEL_PHILIPPINES_ADAPTER_KEY) return TRAVEL_PHILIPPINES_ADAPTER_KEY;
  if (/philippines\.travel/i.test(source.base_url) || /philippines\.travel/i.test(board.list_url)) {
    return TRAVEL_PHILIPPINES_ADAPTER_KEY;
  }
  return "generic_html";
}

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
  const items: CommunityCrawlItemRow[] = [];
  let fetchedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;
  let fatalCode: string | null = null;
  let fatalMessage: string | null = null;

  try {
    const adapterKey = resolveAdapterKey(source, board);
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

        if (upsert.outcome === "inserted") {
          insertedCount += 1;
          items.push(upsert.item);
        } else if (upsert.outcome === "updated") {
          updatedCount += 1;
          items.push(upsert.item);
        } else if (upsert.outcome === "duplicate") {
          duplicateCount += 1;
          items.push(upsert.item);
        } else {
          failedCount += 1;
          failures.push({
            sourceUrl: upsert.canonicalUrl,
            errorCode: upsert.errorCode,
            errorMessage: upsert.errorMessage,
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
  }

  let status: RealCrawlResult["status"] = "FAILED";
  if (items.length > 0 && failedCount === 0 && !fatalCode) status = "SUCCESS";
  else if (items.length > 0) status = "PARTIAL";
  else status = "FAILED";

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
    failedCount,
    errorCode: fatalCode,
    errorMessage: fatalMessage,
    items,
    failures,
  };
}
