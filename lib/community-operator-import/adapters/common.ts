import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { absUrl, cleanText, decodeHtmlText, imageUrlOf, isNonContentImageUrl } from "../normalize";
import type { BoardKind, OperatorListRow, RuntimeBoard, RuntimeSource } from "../types";

export type AdapterContext = { source: RuntimeSource };

export type DiscoveredBoard = {
  boardId: string;
  displayName: string;
  engineKey: string;
  boardKind: BoardKind;
  note?: string | null;
};

export type DetailTarget = {
  articleKey: string;
  detailUrl: string;
  title?: string | null;
  summary?: string | null;
};

/** Board nature from its label (safety default: member Q&A / ads / directories are not auto-selected). */
export function classifyBoardKind(label: string): BoardKind {
  const l = label.toLowerCase();
  if (/광고|홍보|sponsor|advert|promo|\bad\b|kakao_ad|협력업체/.test(l)) return "ads";
  if (/업소록|업체|directory|phonebook|업체등록/.test(l)) return "directory";
  if (/질문|지식|q\s*&\s*a|문의|구인|구직|중고|장터|익명|출석|찾습니다|사람|통곡|request|classified|missing ?persons/.test(l)) {
    return "member_qa";
  }
  if (/자유|토크|커뮤니티|community|free|잡담|갤러리/.test(l)) return "community";
  if (/공지|notice|faq|고객센터|이벤트|event/.test(l)) return "unknown";
  return "editorial";
}

export function slugBoardId(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/[^a-z0-9가-힣_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || createHash("sha1").update(raw).digest("hex").slice(0, 12);
}

/** Stable RSS/link key — unchanged from the previous engine so existing inbox rows keep their keys. */
export function articleKeyFromLink(link: string): string {
  const m = link.match(/\/(\d{5,})(?:\/|$)/) || link.match(/-(\d{5,})(?:\/|$)/);
  if (m?.[1]) return m[1];
  return createHash("sha1").update(link).digest("hex").slice(0, 16);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse loose source dates (ISO, RFC822, `2026.10.05 12:30`, `26-10-05`) into ISO.
 * Dates without a zone are taken as Asia/Manila (+08:00). Returns null when not a date.
 */
export function parseSourceDate(raw: string | null | undefined): string | null {
  const s = cleanText(raw);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const withZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}+08:00`;
    const t = Date.parse(withZone);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const rfc = s.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|GMT|UTC|Z)?/);
  if (rfc) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
    const mon = MONTHS[rfc[2]!.toLowerCase()];
    if (mon) {
      const iso = `${rfc[3]}-${String(mon).padStart(2, "0")}-${rfc[1]!.padStart(2, "0")}T${rfc[4]!.padStart(2, "0")}:${rfc[5]}:${rfc[6] || "00"}+08:00`;
      const t2 = Date.parse(iso);
      return Number.isNaN(t2) ? null : new Date(t2).toISOString();
    }
  }
  const ymd = s.match(/(\d{2,4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (ymd) {
    const y = ymd[1]!.length === 2 ? `20${ymd[1]}` : ymd[1]!;
    const iso = `${y}-${ymd[2]!.padStart(2, "0")}-${ymd[3]!.padStart(2, "0")}T${(ymd[4] || "00").padStart(2, "0")}:${ymd[5] || "00"}:${ymd[6] || "00"}+08:00`;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

export type FeedItem = {
  title: string;
  link: string;
  guid: string | null;
  author: string | null;
  date: string | null;
  /** Decoded HTML body (content:encoded, else description). */
  contentHtml: string;
  /** Plain-text summary (description). */
  summary: string;
  mediaImage: string | null;
  /** RSS <category> / Atom <category term> values. */
  categories: string[];
};

/**
 * Parse RSS 2.0 / Atom. Bodies are read with `.text()` so both CDATA and
 * entity-escaped HTML (`&lt;img …&gt;`, Tistory) decode into real markup.
 */
export function parseFeed(xml: string): { items: FeedItem[]; isFeed: boolean } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const isFeed = $("rss, feed, rdf\\:RDF, RDF").length > 0;
  const items: FeedItem[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const readItem = (el: any, atom: boolean) => {
    const $el = $(el);
    const title = decodeHtmlText($el.children("title").first().text());
    let link = "";
    if (atom) {
      link =
        $el.children("link[rel='alternate']").attr("href") ||
        $el.children("link").first().attr("href") ||
        cleanText($el.children("id").text());
    } else {
      link = cleanText($el.children("link").first().text()) || cleanText($el.children("guid").first().text());
    }
    if (!title || !link) return;
    const encoded = $el.children("content\\:encoded").first().text();
    const desc = atom
      ? $el.children("content").first().text() || $el.children("summary").first().text()
      : $el.children("description").first().text();
    const contentHtml = encoded || desc || "";
    const summaryHtml = desc || encoded || "";
    const media =
      $el.find("media\\:content[url]").filter((_, m) => !/video|audio/i.test($(m).attr("medium") || $(m).attr("type") || "")).first().attr("url") ||
      $el.find("media\\:thumbnail[url]").first().attr("url") ||
      $el.children("enclosure[type^='image']").first().attr("url") ||
      null;
    items.push({
      title,
      link: link.trim(),
      guid: cleanText($el.children("guid").first().text()) || null,
      author:
        decodeHtmlText($el.children("dc\\:creator").first().text() || $el.find("author > name").first().text() || $el.children("author").first().text()) ||
        null,
      date:
        cleanText(
          $el.children("pubDate").first().text() ||
            $el.children("dc\\:date").first().text() ||
            $el.children("published").first().text() ||
            $el.children("updated").first().text(),
        ) || null,
      contentHtml,
      summary: decodeHtmlText(summaryHtml).slice(0, 600),
      mediaImage: media,
      categories: $el
        .children("category")
        .map((_, c) => decodeHtmlText($(c).attr("term") || $(c).text()))
        .get()
        .filter(Boolean),
    });
  };
  $("item").each((_, el) => readItem(el, false));
  if (!items.length) $("entry").each((_, el) => readItem(el, true));
  return { items, isFeed: isFeed || items.length > 0 };
}

export function firstImageInHtml(html: string, base: string): string | null {
  if (!html) return null;
  const $ = cheerio.load(html);
  let found: string | null = null;
  $("img").each((_, img) => {
    if (found) return;
    const u = imageUrlOf($(img), base);
    if (u && !isNonContentImageUrl(u)) found = u;
  });
  return found;
}

export function feedItemsToRows(items: FeedItem[], base: string): OperatorListRow[] {
  return items.map((it, i) => ({
    articleKey: articleKeyFromLink(it.link),
    title: it.title,
    detailUrl: absUrl(base, it.link) || it.link,
    author: it.author,
    sourcePublishedDate: parseSourceDate(it.date) || it.date,
    thumbnailUrl: (it.mediaImage && absUrl(it.link, it.mediaImage)) || firstImageInHtml(it.contentHtml, it.link),
    listOrder: i,
    summary: it.summary || null,
  }));
}

export function boardUrl(source: RuntimeSource, board: Pick<RuntimeBoard, "engineKey">): string {
  const k = String(board.engineKey || "").trim();
  if (/^https?:\/\//i.test(k)) return k;
  const base = source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`;
  return new URL(k.replace(/^\//, ""), base).toString();
}

export function sourceBase(source: RuntimeSource): string {
  return source.baseUrl.endsWith("/") ? source.baseUrl : `${source.baseUrl}/`;
}
