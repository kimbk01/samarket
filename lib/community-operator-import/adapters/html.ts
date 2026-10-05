/**
 * Config-driven HTML adapter for sites without RSS/API.
 * The list item URL template and body selector are proposed by detection and confirmed
 * by the admin (stored in `adapter_config`). Nothing site-specific is coded here.
 */
import * as cheerio from "cheerio";
import { fetchImportText } from "../http";
import {
  BODY_SELECTOR_CHANGED,
  configuredBodySelectorMissed,
  absUrl,
  cleanText,
  GENERIC_BODY_SELECTORS,
  htmlToBlocks,
  imageUrlOf,
  isNonContentImageUrl,
  readPageMeta,
  selectBody,
} from "../normalize";
import type { OperatorListRow, OperatorNormalizedArticle, RuntimeBoard } from "../types";
import {
  type AdapterContext,
  boardUrl,
  classifyBoardKind,
  type DetailTarget,
  type DiscoveredBoard,
  parseSourceDate,
  slugBoardId,
} from "./common";

const CHROME = "header, footer, nav, aside, script, style, #header, #footer, .gnb, .lnb, .header, .footer, .menu, #menu";

/** `/news/article.html?no=123` → `/news/article.html?no` (digits ≥3 become `#`, query keys sorted). */
export function urlTemplate(u: string): string {
  const p = new URL(u);
  return `${p.pathname.replace(/\d{3,}/g, "#")}?${[...p.searchParams.keys()].sort().join("&")}`;
}

export type TemplateCandidate = { template: string; items: number; avgTitle: number; score: number };

/** Rank same-host link templates on a list page; article links have many ids and real titles. */
export function rankItemTemplates(html: string, pageUrl: string): TemplateCandidate[] {
  const $ = cheerio.load(html);
  $(CHROME).remove();
  const host = new URL(pageUrl).host;
  const groups = new Map<string, { ids: Set<string>; titleLen: number; n: number }>();
  $("a[href]").each((_, a) => {
    const u = absUrl(pageUrl, $(a).attr("href"));
    if (!u) return;
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return;
    }
    if (parsed.host !== host || !/\d{3,}/.test(parsed.pathname + parsed.search)) return;
    const t = urlTemplate(u);
    const id = (parsed.pathname + parsed.search).match(/(\d{3,})(?!.*\d{3,})/)?.[1] ?? u;
    const g = groups.get(t) ?? { ids: new Set<string>(), titleLen: 0, n: 0 };
    g.ids.add(id);
    g.titleLen += cleanText($(a).text()).length;
    g.n += 1;
    groups.set(t, g);
  });
  return [...groups.entries()]
    .map(([template, g]) => {
      const avgTitle = Math.round(g.titleLen / Math.max(1, g.n));
      return { template, items: g.ids.size, avgTitle, score: g.ids.size * Math.min(40, avgTitle) };
    })
    .filter((c) => c.items >= 3)
    .sort((a, b) => b.score - a.score);
}

/** Menu links that are never content lists. */
const NON_LIST_PATH =
  /(log-?in|log-?out|member|join|sign-?up|register|mypage|my-page|account|search|sitemap|privacy|policy|agreement|terms|contact|about|faq|\/com\/|\.(?:jpe?g|png|gif|pdf|zip)$)/i;

export async function discoverHtmlBoards(ctx: AdapterContext, homeHtml: string, inputUrl: string): Promise<DiscoveredBoard[]> {
  const $ = cheerio.load(homeHtml);
  const base = new URL(ctx.source.baseUrl);
  const found = new Map<string, DiscoveredBoard>();
  const labels = new Set<string>();
  const add = (raw: string, label: string) => {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return;
    }
    if (u.host.replace(/^www\./, "") !== base.host.replace(/^www\./, "")) return;
    u.protocol = base.protocol; // http/https duplicates collapse to the site's scheme
    u.host = base.host;
    u.hash = "";
    if (NON_LIST_PATH.test(u.pathname + u.search)) return;
    const key = u.pathname + u.search;
    if (found.has(key) || labels.has(label)) return;
    labels.add(label);
    found.set(key, {
      boardId: slugBoardId(key === "/" ? "home" : key),
      displayName: label,
      engineKey: u.toString(),
      boardKind: classifyBoardKind(label),
    });
  };
  // The page the admin entered is itself a candidate list page.
  if (rankItemTemplates(homeHtml, inputUrl).length) add(inputUrl, "입력한 페이지 (메인 목록)");
  $("nav a[href], header a[href], .gnb a[href], .lnb a[href], .menu a[href], #menu a[href], .nav a[href]").each((_, a) => {
    const u = absUrl(inputUrl, $(a).attr("href"));
    const label = cleanText($(a).text());
    if (!u || !label || label.length > 20) return;
    add(u, label);
  });
  return [...found.values()].slice(0, 40);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anchorTitle($: ReturnType<typeof cheerio.load>, a: any): string {
  const $a = $(a);
  const strong = cleanText($a.find("strong, h1, h2, h3, h4, .title, .tit, .subject").first().text());
  const t = strong || cleanText($a.attr("title")) || cleanText($a.text());
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

export async function listHtml(ctx: AdapterContext, board: RuntimeBoard, page: number): Promise<OperatorListRow[]> {
  if (page > 1) return [];
  const url = boardUrl(ctx.source, board);
  const res = await fetchImportText(url);
  const template = ctx.source.adapterConfig.itemUrlTemplate || rankItemTemplates(res.text, res.finalUrl)[0]?.template;
  if (!template) return [];
  const $ = cheerio.load(res.text);
  $(CHROME).remove();
  const rows: OperatorListRow[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, a) => {
    const u = absUrl(res.finalUrl, $(a).attr("href"));
    if (!u) return;
    let tpl: string;
    try {
      tpl = urlTemplate(u);
    } catch {
      return;
    }
    if (tpl !== template) return;
    const parsed = new URL(u);
    const key = (parsed.pathname + parsed.search).match(/(\d{3,})(?!.*\d{3,})/)?.[1];
    if (!key || seen.has(key)) return;
    const title = anchorTitle($, a);
    if (title.length < 4) return;
    seen.add(key);
    const scope = $(a).closest("li, dl, tr, article, .item, .list-block");
    let thumb: string | null = null;
    scope.find("img").each((__, img) => {
      if (thumb) return;
      const iu = imageUrlOf($(img), res.finalUrl);
      if (iu && !isNonContentImageUrl(iu)) thumb = iu;
    });
    rows.push({ articleKey: key, title, detailUrl: u, author: null, sourcePublishedDate: null, thumbnailUrl: thumb, listOrder: rows.length });
  });
  return rows;
}

const DATE_IN_TEXT = /(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?(?:\s+(\d{1,2}):(\d{2}))?/;

export async function detailHtml(ctx: AdapterContext, board: RuntimeBoard, target: DetailTarget): Promise<OperatorNormalizedArticle> {
  const cfg = ctx.source.adapterConfig;
  const res = await fetchImportText(target.detailUrl);
  const $ = cheerio.load(res.text);
  const meta = readPageMeta($);
  const body = selectBody($, [...(cfg.bodySelectors ?? []), ...GENERIC_BODY_SELECTORS]);
  const blocks = body ? htmlToBlocks(body.html, { baseUrl: res.finalUrl, removeSelectors: cfg.removeSelectors }) : [];
  let dateRaw: string | null = meta.published;
  if (!dateRaw && cfg.dateSelector) dateRaw = cleanText($(cfg.dateSelector).first().text()) || null;
  if (!dateRaw) {
    // Last resort: first date-looking text in the page header area (before the body).
    const head = cleanText($("body").text()).slice(0, 3000);
    const m = head.match(DATE_IN_TEXT);
    if (m) dateRaw = m[0];
  }
  return {
    sourceSite: ctx.source.id,
    sourceBoard: board.boardId,
    sourceBoardLabel: board.displayName,
    canonicalUrl: res.finalUrl,
    sourceArticleKey: target.articleKey,
    title: meta.ogTitle || cleanText($("h1").first().text()) || String(target.title || ""),
    author: meta.author,
    sourcePublishedDate: parseSourceDate(dateRaw),
    orderedContentBlocks: blocks,
    // A page meta description is often the site-wide blurb, never an article summary.
    summary: null,
    extraction: {
      bodySource: body?.selector ?? "none",
      sourceImageCount: body ? cheerio.load(body.html)("img").length : 0,
      ogImage: meta.ogImage ? absUrl(res.finalUrl, meta.ogImage) : null,
      usedFeedFallback: false,
      warnings: [...(body ? [] : ["body_selector_not_found"]), ...(configuredBodySelectorMissed(cfg.bodySelectors, body) ? [BODY_SELECTOR_CHANGED] : [])],
    },
  };
}
