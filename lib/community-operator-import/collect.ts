/**
 * Dispatch list/detail to verified extractors.
 * Runtime registry = code seed + Admin-enabled managed sources.
 */
import { fetchPhilsamoTravelDetail, fetchPhilsamoTravelList } from "./philsamo-travel";
import { fetchRssDetail, fetchRssList } from "./rss-atom";
import {
  boardListUrl,
  listVerifiedBoards,
  listVerifiedSources,
  type VerifiedOperatorBoard,
  type VerifiedOperatorSource,
} from "./registry";
import {
  buildRuntimeOperationalRegistry,
  resolveRuntimeSourceBoard,
  type ManagedSourceRow,
} from "./source-store";
import type { OperatorListRow, OperatorNormalizedArticle } from "./types";
import { fetchWordpressDetail, fetchWordpressList } from "./wordpress-rest";

export type OperatorSourceMeta = {
  site: string;
  siteLabel: string;
  board: string;
  boardLabel: string;
  boardUrl: string;
  engine: string;
};

export type CollectListOptions = {
  page?: number;
  maxPages?: number;
  maxItems?: number;
};

export async function loadOperationalRegistry(): Promise<{
  sources: VerifiedOperatorSource[];
  boards: VerifiedOperatorBoard[];
  managed: ManagedSourceRow[];
}> {
  try {
    const { getSupabaseServer } = await import("@/lib/chat/supabase-server");
    const sb = getSupabaseServer();
    return await buildRuntimeOperationalRegistry(sb);
  } catch {
    return {
      sources: listVerifiedSources(),
      boards: listVerifiedBoards(),
      managed: [],
    };
  }
}

export function buildRegistryPayloadFromRuntime(runtime: {
  sources: VerifiedOperatorSource[];
  boards: VerifiedOperatorBoard[];
  managed: ManagedSourceRow[];
}) {
  return {
    sources: runtime.sources.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      baseUrl: s.baseUrl,
      engine: s.engine,
      status: s.status,
      priority: s.priority,
      boards: runtime.boards
        .filter((b) => b.sourceId === s.id)
        .map((b) => ({
          boardId: b.boardId,
          displayName: b.displayName,
          shortLabel: b.shortLabel,
          category: b.category,
        })),
    })),
    managed: runtime.managed,
  };
}

export function toSourceMeta(source: VerifiedOperatorSource, board: VerifiedOperatorBoard): OperatorSourceMeta {
  return {
    site: source.id,
    siteLabel: source.displayName,
    board: board.boardId,
    boardLabel: board.displayName,
    boardUrl: boardListUrl(source, board),
    engine: source.engine,
  };
}

async function listOnePage(
  source: VerifiedOperatorSource,
  board: VerifiedOperatorBoard,
  page: number,
): Promise<OperatorListRow[]> {
  if (source.engine === "gnuboard") {
    return fetchPhilsamoTravelList(page, board.engineKey);
  }
  if (source.engine === "wordpress_rest") {
    return fetchWordpressList(source, board, page);
  }
  if (source.engine === "rss_atom") {
    return fetchRssList(source, board, page);
  }
  throw new Error(`source_engine_unsupported:${source.id}`);
}

export async function collectOperatorList(
  sourceId: string,
  boardId: string,
  opts: CollectListOptions | number = 1,
): Promise<{ meta: OperatorSourceMeta; rows: OperatorListRow[]; page: number; maxPages: number }> {
  const runtime = await loadOperationalRegistry();
  const pair = resolveRuntimeSourceBoard(runtime.sources, runtime.boards, sourceId, boardId);
  if (!pair) throw new Error("source_board_unsupported");
  const { source, board } = pair;
  const meta = toSourceMeta(source, board);

  const options: CollectListOptions = typeof opts === "number" ? { page: opts } : opts || {};
  const startPage = Math.max(1, Math.min(20, Number(options.page) || 1));
  const maxPages = Math.max(1, Math.min(5, Number(options.maxPages) || 1));
  const maxItems = Math.max(1, Math.min(100, Number(options.maxItems) || 40));

  const rows: OperatorListRow[] = [];
  const seen = new Set<string>();
  for (let p = startPage; p < startPage + maxPages; p++) {
    const chunk = await listOnePage(source, board, p);
    if (!chunk.length) break;
    for (const row of chunk) {
      if (seen.has(row.articleKey)) continue;
      seen.add(row.articleKey);
      rows.push({ ...row, listOrder: rows.length });
      if (rows.length >= maxItems) break;
    }
    if (rows.length >= maxItems) break;
    if (chunk.length < 10) break;
  }

  return { meta, rows, page: startPage, maxPages };
}

export async function collectOperatorDetail(
  sourceId: string,
  boardId: string,
  articleKey: string,
): Promise<OperatorNormalizedArticle> {
  const runtime = await loadOperationalRegistry();
  const pair = resolveRuntimeSourceBoard(runtime.sources, runtime.boards, sourceId, boardId);
  if (!pair) throw new Error("source_board_unsupported");
  const { source, board } = pair;

  if (source.engine === "gnuboard") {
    return fetchPhilsamoTravelDetail(articleKey, board.engineKey);
  }
  if (source.engine === "wordpress_rest") {
    return fetchWordpressDetail(source, board, articleKey);
  }
  if (source.engine === "rss_atom") {
    return fetchRssDetail(source, board, articleKey);
  }
  throw new Error(`source_engine_unsupported:${source.id}`);
}

/** @deprecated use loadOperationalRegistry + buildRegistryPayloadFromRuntime */
export function buildRegistryPayload() {
  const sources = listVerifiedSources().map((s) => ({
    id: s.id,
    displayName: s.displayName,
    baseUrl: s.baseUrl,
    engine: s.engine,
    status: s.status,
    priority: s.priority,
    boards: listVerifiedBoards(s.id).map((b) => ({
      boardId: b.boardId,
      displayName: b.displayName,
      shortLabel: b.shortLabel,
      category: b.category,
    })),
  }));
  return { sources };
}

export function resolveSourceBoardPair(sourceId: string, boardId: string) {
  return resolveRuntimeSourceBoard(listVerifiedSources(), listVerifiedBoards(), sourceId, boardId);
}
