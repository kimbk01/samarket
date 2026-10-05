/**
 * COLLECTION: list → inbox, detail → normalized article + quality.
 * Every fetch first honors robots.txt; challenges / 401 / 403 are reported, never bypassed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { adapterFor } from "./adapters";
import { boardUrl } from "./adapters/common";
import { describeFetchError, ImportFetchError } from "./http";
import { type InboxKey, loadInboxRow, recordInboxQuality, upsertInboxRowsFromList, type UpsertInboxResult } from "./inbox-store";
import { withQuality } from "./quality";
import { assertRobotsAllows } from "./robots";
import {
  type ManagedBoard,
  type ManagedSource,
  recordBoardOutcome,
  recordSourceOutcome,
  resolvePreviewPair,
} from "./source-store";
import type { OperatorListRow, OperatorNormalizedArticle } from "./types";

export type CollectErrorKind = "robots" | "blocked" | "http" | "network" | "parse" | "empty";

export function classifyCollectError(e: unknown): { kind: CollectErrorKind; message: string } {
  const message = e instanceof ImportFetchError ? describeFetchError(e) : e instanceof Error ? e.message : String(e);
  if (/^robots_disallowed/.test(message)) return { kind: "robots", message };
  if (e instanceof ImportFetchError) {
    if (e.code === "challenge" || e.status === 401 || e.status === 403) return { kind: "blocked", message };
    if (e.code === "timeout" || e.code === "network") return { kind: "network", message };
    return { kind: "http", message };
  }
  return { kind: "parse", message };
}

export async function listBoardPage(
  source: ManagedSource,
  board: ManagedBoard,
  page: number,
): Promise<OperatorListRow[]> {
  await assertRobotsAllows(boardUrl(source, board));
  return adapterFor(source.engine).list({ source }, board, Math.max(1, Math.min(20, page)));
}

export type BoardCollectResult = {
  sourceId: string;
  boardId: string;
  ok: boolean;
  pages: number;
  listed: number;
  inbox: Omit<UpsertInboxResult, "rows"> | null;
  latestSourceAt: string | null;
  error: string | null;
  errorKind: CollectErrorKind | null;
};

function latestDate(rows: OperatorListRow[]): string | null {
  const ts = rows.map((r) => Date.parse(String(r.sourcePublishedDate || ""))).filter((n) => !Number.isNaN(n));
  return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
}

/** Collect 1..N list pages of a board into the inbox and record the outcome on the board/source. */
export async function collectBoardToInbox(
  sb: SupabaseClient,
  source: ManagedSource,
  board: ManagedBoard,
  opts: { pages?: number; maxItems?: number } = {},
): Promise<BoardCollectResult & { rows: OperatorListRow[] }> {
  const pages = Math.max(1, Math.min(5, opts.pages ?? 1));
  const maxItems = Math.max(1, Math.min(200, opts.maxItems ?? 60));
  const rows: OperatorListRow[] = [];
  const seen = new Set<string>();
  let fetched = 0;
  try {
    for (let p = 1; p <= pages; p++) {
      const chunk = await listBoardPage(source, board, p);
      fetched++;
      let added = 0;
      for (const r of chunk) {
        if (seen.has(r.articleKey)) continue;
        seen.add(r.articleKey);
        rows.push({ ...r, listOrder: rows.length });
        added++;
        if (rows.length >= maxItems) break;
      }
      if (!added || rows.length >= maxItems) break;
    }
    if (!rows.length) {
      const err = "list_empty";
      await recordBoardOutcome(sb, { sourceId: source.id, boardId: board.boardId, ok: false, error: err, verdict: "FAILED", prevFailures: board.status.consecutiveFailures });
      return { sourceId: source.id, boardId: board.boardId, ok: false, pages: fetched, listed: 0, inbox: null, latestSourceAt: null, error: err, errorKind: "empty", rows };
    }
    const inbox = await upsertInboxRowsFromList(sb, { sourceSite: source.id, sourceBoard: board.boardId, rows });
    const latest = latestDate(rows);
    await recordBoardOutcome(sb, { sourceId: source.id, boardId: board.boardId, ok: true, latestSourceAt: latest, prevFailures: board.status.consecutiveFailures });
    await recordSourceOutcome(sb, { sourceId: source.id, ok: true, prevFailures: source.status.consecutiveFailures });
    return {
      sourceId: source.id,
      boardId: board.boardId,
      ok: true,
      pages: fetched,
      listed: rows.length,
      inbox: { inserted: inbox.inserted, changed: inbox.changed, unchanged: inbox.unchanged },
      latestSourceAt: latest,
      error: null,
      errorKind: null,
      rows,
    };
  } catch (e) {
    const c = classifyCollectError(e);
    const verdict = c.kind === "robots" || c.kind === "blocked" ? "BLOCKED" : "FAILED";
    await recordBoardOutcome(sb, { sourceId: source.id, boardId: board.boardId, ok: false, error: c.message, verdict, prevFailures: board.status.consecutiveFailures });
    await recordSourceOutcome(sb, { sourceId: source.id, ok: false, error: `${board.boardId}: ${c.message}`, prevFailures: source.status.consecutiveFailures });
    return { sourceId: source.id, boardId: board.boardId, ok: false, pages: fetched, listed: rows.length, inbox: null, latestSourceAt: null, error: c.message, errorKind: c.kind, rows };
  }
}

/**
 * Fetch + normalize one article. The detail URL always comes from the stored inbox row
 * (or the list row), never rebuilt from a guessed pattern.
 */
export async function fetchArticle(
  source: ManagedSource,
  board: ManagedBoard,
  target: { articleKey: string; detailUrl: string; title?: string | null; summary?: string | null },
): Promise<OperatorNormalizedArticle> {
  if (!target.detailUrl) throw new Error("detail_url_missing");
  await assertRobotsAllows(target.detailUrl);
  const article = await adapterFor(source.engine).detail({ source }, board, target);
  return withQuality({
    ...article,
    sourceSite: source.id,
    sourceBoard: board.boardId,
    sourceBoardLabel: article.sourceBoardLabel || board.displayName,
    sourceArticleKey: target.articleKey,
  });
}

/** Detail for an inbox row: loads the row, fetches, and stores the quality outcome on it. */
export async function fetchArticleForInbox(
  sb: SupabaseClient,
  key: InboxKey,
): Promise<{ article: OperatorNormalizedArticle; source: ManagedSource; board: ManagedBoard }> {
  const { source, board } = await resolvePreviewPair(sb, key.sourceSite, key.sourceBoard);
  const row = await loadInboxRow(sb, key);
  if (!row) throw new Error("inbox_row_not_found");
  try {
    const article = await fetchArticle(source, board, {
      articleKey: row.sourceArticleKey,
      detailUrl: row.canonicalUrl,
      title: row.title,
      summary: row.summary,
    });
    await recordInboxQuality(sb, key, {
      quality: article.quality?.verdict ?? null,
      reasons: article.quality?.reasons ?? [],
      failed: article.quality?.verdict === "FAILED",
      error: article.quality?.verdict === "FAILED" ? article.quality.reasons.join(", ") : null,
    });
    return { article, source, board };
  } catch (e) {
    const c = classifyCollectError(e);
    await recordInboxQuality(sb, key, { quality: "FAILED", reasons: [c.kind], error: c.message, failed: true });
    throw new Error(c.message);
  }
}
