/**
 * KWF LANGUAGE_RESOURCE adapter — Koha OPAC metadata only.
 * Never copies full copyrighted text. Bot/CF challenge → operator needs_check path.
 */
import * as cheerio from "cheerio";
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import {
  normalizeDiscoverOpts,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import type { ExternalBoardDiscoverItem, ExternalBoardDocument, ExternalBoardNode } from "@/lib/external-board-import/types";

export const KWF_OPAC_HOST = "library.kwf.gov.ph";
export const KWF_SEARCH_URL =
  "https://library.kwf.gov.ph/cgi-bin/koha/opac-search.pl?q=filipino+grammar&count=20&sort_by=relevance";

export type KwfLanguageResourceMeta = {
  biblionumber: string;
  title: string;
  author: string | null;
  publicationYear: string | null;
  language: string | null;
  subject: string | null;
  materialType: string | null;
  description: string | null;
  callNumber: string | null;
  recordUrl: string;
};

function isBotChallenge(html: string): boolean {
  const head = html.slice(0, 2000);
  return /not a bot|Just a moment|cf-browser|challenge-platform|Attention Required/i.test(head);
}

async function fetchHtml(url: string): Promise<{ ok: true; html: string } | { ok: false; code: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "text/html",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, code: `http_${res.status}` };
    const html = await res.text();
    if (isBotChallenge(html)) return { ok: false, code: "bot_challenge" };
    return { ok: true, html };
  } catch {
    return { ok: false, code: "fetch_failed" };
  }
}

/** Parse Koha search result rows into metadata stubs (no full text). */
export function parseKwfSearchResults(html: string, baseUrl: string): KwfLanguageResourceMeta[] {
  const $ = cheerio.load(html);
  const out: KwfLanguageResourceMeta[] = [];
  const seen = new Set<string>();

  $('a[href*="opac-detail.pl"]').each((_, a) => {
    const hrefRaw = String($(a).attr("href") || "").trim();
    if (!hrefRaw) return;
    const abs = new URL(hrefRaw, baseUrl);
    const biblionumber = abs.searchParams.get("biblionumber") || "";
    if (!biblionumber || seen.has(biblionumber)) return;
    const title = $(a).text().replace(/\s+/g, " ").trim();
    if (!title || title.length < 3) return;
    seen.add(biblionumber);
    const row = $(a).closest("tr, .searchresults, .title");
    const rowText = row.text().replace(/\s+/g, " ").trim();
    out.push({
      biblionumber,
      title,
      author: null,
      publicationYear: (rowText.match(/\b(19|20)\d{2}\b/) || [])[0] || null,
      language: null,
      subject: null,
      materialType: null,
      description: null,
      callNumber: null,
      recordUrl: `https://${KWF_OPAC_HOST}/cgi-bin/koha/opac-detail.pl?biblionumber=${biblionumber}`,
    });
  });
  return out;
}

/** Parse Koha detail page metadata fields only. */
export function parseKwfDetail(html: string, recordUrl: string): KwfLanguageResourceMeta | null {
  if (isBotChallenge(html)) return null;
  const $ = cheerio.load(html);
  const title =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $("title").text().split("›")[0]?.replace(/\s+/g, " ").trim() ||
    "";
  if (!title) return null;
  const u = new URL(recordUrl);
  const biblionumber = u.searchParams.get("biblionumber") || "unknown";

  const labelValue = (label: RegExp): string | null => {
    let found: string | null = null;
    $("span, th, dt, td, li, div").each((_, el) => {
      if (found) return;
      const t = $(el).text().replace(/\s+/g, " ").trim();
      if (!label.test(t)) return;
      const next = $(el).next().text().replace(/\s+/g, " ").trim();
      if (next && next.length < 300) found = next;
    });
    return found;
  };

  const bodyText = $("main, #catalogue_detail_biblio, .record").text().replace(/\s+/g, " ");
  const year = (bodyText.match(/\b(19|20)\d{2}\b/) || [])[0] || null;

  return {
    biblionumber,
    title,
    author: labelValue(/^author|^by\b|^may-akda/i) || null,
    publicationYear: year,
    language: labelValue(/^language|^wika/i) || null,
    subject: labelValue(/^subject|^paksa/i) || null,
    materialType: labelValue(/^material type|^item type|^uri ng/i) || null,
    description: labelValue(/^summary|^description|^buod/i) || null,
    callNumber: labelValue(/^call number|^call no/i) || null,
    recordUrl,
  };
}

/** DIBAY language-resource card body — metadata only, never full text. */
export function kwfMetaToDocument(meta: KwfLanguageResourceMeta): ExternalBoardDocument {
  const lines: string[] = [
    `자료명: ${meta.title}`,
    meta.author ? `저자: ${meta.author}` : null,
    meta.publicationYear ? `출판연도: ${meta.publicationYear}` : null,
    meta.language ? `언어: ${meta.language}` : null,
    meta.subject ? `주제: ${meta.subject}` : null,
    meta.materialType ? `자료유형: ${meta.materialType}` : null,
    meta.callNumber ? `청구기호: ${meta.callNumber}` : null,
    meta.description ? `간략 설명: ${meta.description}` : null,
  ].filter(Boolean) as string[];

  const nodes: ExternalBoardNode[] = lines.map((text) => ({ type: "paragraph", text }));
  return {
    title: meta.title,
    canonicalUrl: meta.recordUrl,
    nodes,
    feedThumbnailSrc: null,
  };
}

export const kwfLanguageResourceAdapter: ExternalBoardAdapter = {
  id: "kwf-language-resource",
  matches: (ctx: ExternalBoardAdapterContext) =>
    ctx.siteKey.includes(KWF_OPAC_HOST) ||
    ctx.sourceUrl.includes(KWF_OPAC_HOST) ||
    ctx.sourceUrl.includes("kwf.gov.ph"),
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3 });
    if (samples.length >= 2) return { status: "READY", reasons: ["kwf_metadata_ready"], samples };
    if (samples.length > 0) return { status: "PARTIAL", reasons: ["kwf_metadata_partial"], samples };
    return { status: "UNSUPPORTED", reasons: ["kwf_bot_or_unreachable"], samples: [] };
  },
  async discoverArticles(_ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const fetched = await fetchHtml(KWF_SEARCH_URL);
    if (!fetched.ok) {
      throw Object.assign(new Error("확인 필요 — 아직 수집할 수 없습니다."), {
        failureStage: "discover",
        failureCode: fetched.code === "bot_challenge" ? "needs_check" : "fetch_failed",
      });
    }
    const listed = parseKwfSearchResults(fetched.html, KWF_SEARCH_URL).slice(0, n.limit);
    const collected: ExternalBoardDiscoverItem[] = [];
    for (const item of listed) {
      const detailFetch = await fetchHtml(item.recordUrl);
      const meta =
        detailFetch.ok ? parseKwfDetail(detailFetch.html, item.recordUrl) || item : item;
      const doc = kwfMetaToDocument(meta);
      collected.push({
        stableArticleIdentity: `stable:kwf-biblio-${meta.biblionumber}`,
        identityKind: "stable_id",
        canonicalUrl: meta.recordUrl,
        title: meta.title,
        sourceAuthor: meta.author || "Komisyon sa Wikang Filipino",
        sourcePublishedAt: meta.publicationYear ? `${meta.publicationYear}-01-01T00:00:00.000Z` : null,
        sampleDocument: doc,
        sourcePage: 1,
        sourceSequence: collected.length,
        visitedListUrl: KWF_SEARCH_URL,
      });
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const fetched = await fetchHtml(item.canonicalUrl);
    if (!fetched.ok) {
      if (item.sampleDocument) return item.sampleDocument;
      throw Object.assign(new Error("확인 필요 — 아직 수집할 수 없습니다."), {
        failureStage: "fetch",
        failureCode: fetched.code,
      });
    }
    const meta = parseKwfDetail(fetched.html, item.canonicalUrl);
    if (!meta) {
      if (item.sampleDocument) return item.sampleDocument;
      throw Object.assign(new Error("kwf_detail_empty"), {
        failureStage: "fetch",
        failureCode: "empty_document",
      });
    }
    return kwfMetaToDocument(meta);
  },
};
