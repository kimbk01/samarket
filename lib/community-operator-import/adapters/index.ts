import type { OperatorListRow, OperatorNormalizedArticle, RuntimeBoard, SourceEngine } from "../types";
import type { AdapterContext, DetailTarget } from "./common";
import { detailGnuboard, listGnuboard } from "./gnuboard";
import { detailHtml, listHtml } from "./html";
import { detailRss, listRss } from "./rss";
import { detailWordpress, listWordpress } from "./wordpress";

export type SourceAdapter = {
  list(ctx: AdapterContext, board: RuntimeBoard, page: number): Promise<OperatorListRow[]>;
  detail(ctx: AdapterContext, board: RuntimeBoard, target: DetailTarget): Promise<OperatorNormalizedArticle>;
};

const ADAPTERS: Record<SourceEngine, SourceAdapter> = {
  gnuboard: { list: listGnuboard, detail: detailGnuboard },
  wordpress_rest: { list: listWordpress, detail: detailWordpress },
  rss_atom: { list: listRss, detail: detailRss },
  html: { list: listHtml, detail: detailHtml },
};

export function adapterFor(engine: SourceEngine): SourceAdapter {
  const a = ADAPTERS[engine];
  if (!a) throw new Error(`source_engine_unsupported:${engine}`);
  return a;
}

export type { AdapterContext, DetailTarget } from "./common";
