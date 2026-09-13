import * as cheerio from "cheerio";
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import { absolutizeUrl, fetchExternalBoardHtml } from "@/lib/external-board-import/extraction/fetch-html";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import { buildDocumentFromHtml, extractMetaAuthor, extractOgTitle } from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem } from "@/lib/external-board-import/types";

function boardTable(url: string): string | null {
  try {
    return new URL(url).searchParams.get("bo_table");
  } catch {
    return null;
  }
}

function listUrlForPage(sourceUrl: string, page: number): string {
  const u = new URL(sourceUrl);
  if (page <= 1) u.searchParams.delete("page");
  else u.searchParams.set("page", String(page));
  return u.toString();
}

async function fetchPhilsamoArticle(item: ExternalBoardDiscoverItem): Promise<ExternalBoardDiscoverItem> {
  const fetched = await fetchExternalBoardHtml(item.canonicalUrl);
  if (!fetched.ok) return { ...item, sampleDocument: null };
  const $ = cheerio.load(fetched.html);
  const title =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    extractOgTitle(fetched.html) ||
    item.title;
  let author =
    $(".sign-author .panel-title").parent().find("strong, b, a").first().text().replace(/\s+/g, " ").trim() ||
    extractMetaAuthor(fetched.html);
  if (!author) {
    const gn = $(".view-wrap .sv_member, .view-wrap .sv_guest, .view-padding .sv_member").first().text().replace(/\s+/g, " ").trim();
    if (gn) author = gn;
  }
  let sourcePublishedAt: string | null = null;
  const timeCandidates = [
    $("time").first().attr("datetime"),
    $("time").first().text(),
    $(".view-wrap").text().match(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/)?.[0],
  ];
  for (const c of timeCandidates) {
    sourcePublishedAt = parseExternalBoardSourceDate(c || null);
    if (sourcePublishedAt) break;
  }
  let doc = buildDocumentFromHtml({
    title,
    canonicalUrl: item.canonicalUrl,
    html: fetched.html,
    baseUrl: fetched.finalUrl,
    rootSelector: ".view-content",
  });
  if (!doc.nodes.length) {
    doc = buildDocumentFromHtml({
      title,
      canonicalUrl: item.canonicalUrl,
      html: fetched.html,
      baseUrl: fetched.finalUrl,
      rootSelector: "#bo_v_con, .view-padding",
    });
  }
  if (!doc.nodes.length) {
    const desc = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content");
    if (desc) doc.nodes.push({ type: "paragraph", text: String(desc).trim() });
  }
  // YouTube embeds → link node (ordered, not fake image)
  $(".view-content iframe[src*='youtube'], .view-content iframe[src*='youtu']").each((_, iframe) => {
    const src = String($(iframe).attr("src") || "").trim();
    if (src) doc.nodes.unshift({ type: "link", href: src.startsWith("//") ? `https:${src}` : src, text: "YouTube" });
  });
  return {
    ...item,
    title: title.replace(/\s*\|\s*필리핀.*$/u, "").trim() || title,
    sourceAuthor: author || null,
    sourcePublishedAt,
    sampleDocument: doc.nodes.length ? doc : null,
  };
}

export const philsamoExternalBoardAdapter: ExternalBoardAdapter = {
  id: "philsamo-gnuboard",
  matches: (ctx: ExternalBoardAdapterContext) => {
    if (!(ctx.siteKey === "philsamo.com" || ctx.sourceUrl.includes("philsamo.com"))) return false;
    const table = boardTable(ctx.sourceUrl);
    return Boolean(table) || ctx.sourceUrl.includes("bo_table=");
  },
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 3) return { status: "READY", reasons: ["philsamo_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["philsamo_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["philsamo_no_samples"], samples: [] };
  },
  async discoverArticles(ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const table = boardTable(ctx.sourceUrl) || "news";
    const collected: ExternalBoardDiscoverItem[] = [];
    const seen = new Set<string>();
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const listUrl = listUrlForPage(ctx.sourceUrl, page);
      const fetched = await fetchExternalBoardHtml(listUrl);
      if (!fetched.ok) break;
      const $ = cheerio.load(fetched.html);
      const items: Array<{ wrId: string; url: string; title: string }> = [];
      $('a[href*="wr_id="]').each((_, a) => {
        const abs = absolutizeUrl(fetched.finalUrl, String($(a).attr("href") || "").replace(/&amp;/g, "&"));
        if (!abs) return;
        let u: URL;
        try {
          u = new URL(abs);
        } catch {
          return;
        }
        if (u.searchParams.get("bo_table") !== table) return;
        const wrId = u.searchParams.get("wr_id");
        if (!wrId || seen.has(wrId)) return;
        const title = $(a).text().replace(/\s+/g, " ").trim();
        if (!title || title.length < 2) return;
        seen.add(wrId);
        items.push({
          wrId,
          title,
          url: `https://philsamo.com/bbs/board.php?bo_table=${encodeURIComponent(table)}&wr_id=${wrId}`,
        });
      });
      for (const it of items) {
        const base: ExternalBoardDiscoverItem = {
          stableArticleIdentity: `stable:philsamo-${table}-${it.wrId}`,
          identityKind: "stable_id",
          canonicalUrl: it.url,
          title: it.title,
        };
        const full = await fetchPhilsamoArticle(base);
        if (!withinDateRange(full.sourcePublishedAt, n.dateFrom, n.dateTo)) continue;
        collected.push({
          ...full,
          sourcePage: page,
          sourceSequence: collected.length,
          visitedListUrl: listUrl,
        });
        if (collected.length >= n.limit) break;
      }
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const full = await fetchPhilsamoArticle(item);
    if (full.sampleDocument) return full.sampleDocument;
    throw Object.assign(new Error("philsamo_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
