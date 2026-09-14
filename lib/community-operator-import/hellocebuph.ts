/**
 * Hello Cebu thin wrappers — prefer wordpress-rest + registry for new code.
 */
import { fetchWordpressDetail, fetchWordpressList, parseWordpressPostJson } from "./wordpress-rest";
import type { OperatorListRow, OperatorNormalizedArticle } from "./types";

export const HELLOCEBU_SOURCE_SITE = "hellocebuph";
export const HELLOCEBU_BASE = "https://hellocebuph.com";

export async function fetchHelloCebuList(page = 1, boardId: string): Promise<OperatorListRow[]> {
  return fetchWordpressList(HELLOCEBU_SOURCE_SITE, boardId, page);
}

export async function fetchHelloCebuDetail(articleKey: string, boardId: string): Promise<OperatorNormalizedArticle> {
  return fetchWordpressDetail(HELLOCEBU_SOURCE_SITE, boardId, articleKey);
}

export { parseWordpressPostJson };
