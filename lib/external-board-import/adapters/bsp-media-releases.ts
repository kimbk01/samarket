/**
 * Bangko Sentral ng Pilipinas — Media Releases (HTML) via official SharePoint REST.
 * Philippine Economic Updates PDFs are a separate REFERENCE section — not this adapter.
 * No CF/bot bypass. Filipino section uses PR Translations → Media item ids.
 */
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import { buildDocumentFromHtml } from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem, ExternalBoardDocument } from "@/lib/external-board-import/types";

const HOST = "bsp.gov.ph";
const ORG_AUTHOR = "Bangko Sentral ng Pilipinas";
const LIST =
  "https://www.bsp.gov.ph/_api/web/lists/getbytitle('Media%20Releases%20and%20Advisories')/items";
const PR_TRANSLATIONS =
  "https://www.bsp.gov.ph/_api/web/lists/getbytitle('PR%20Translations')/items";
const CANONICAL_TMPL =
  "https://www.bsp.gov.ph/SitePages/MediaAndResearch/MediaDisp.aspx?ItemId=";

type BspMode = "en_media" | "fil_media";

type SpItem = {
  Id?: number;
  ID?: number;
  Title?: string;
  PDate?: string;
  Content?: string;
  Tag?: string;
  LocalLanguage?: boolean;
  Filipino?: number;
  English?: number;
};

function decodeSpHtml(html: string): string {
  return String(html ?? "")
    .replace(/&#58;/g, ":")
    .replace(/&#160;/g, " ")
    .replace(/&nbsp;/g, " ");
}

function itemId(it: SpItem): number | null {
  const n = Number(it.Id ?? it.ID ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function canonicalFor(id: number): string {
  return `${CANONICAL_TMPL}${id}`;
}

function modeFromCtx(ctx: ExternalBoardAdapterContext): BspMode | null {
  const u = ctx.sourceUrl.toLowerCase();
  if (/filipino|local.?language|lang=fil|pr.?translation/i.test(u)) return "fil_media";
  if (/media.?list|media.?release|mediadisp|mediaandresearch/i.test(u)) return "en_media";
  if (ctx.boardKey.includes("filipino") || ctx.boardKey.includes("fil")) return "fil_media";
  if (ctx.boardKey.includes("media") || ctx.boardKey.includes("bsp")) return "en_media";
  return null;
}

async function fetchSpJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        accept: "application/json;odata=verbose",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function documentFromItem(it: SpItem): ExternalBoardDocument | null {
  const id = itemId(it);
  const title = String(it.Title ?? "").replace(/\s+/g, " ").trim();
  if (!id || !title) return null;
  const canonicalUrl = canonicalFor(id);
  const raw = decodeSpHtml(it.Content || "");
  if (!raw.trim()) return null;
  const html = `<div id="bsp-media-root">${raw}</div>`;
  const doc = buildDocumentFromHtml({
    title,
    canonicalUrl,
    html,
    baseUrl: "https://www.bsp.gov.ph",
    rootSelector: "#bsp-media-root",
  });
  if (!doc.nodes.length) {
    const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;
    doc.nodes.push({ type: "paragraph", text });
  }
  const firstImg = doc.nodes.find((n) => n.type === "image" && n.src);
  if (firstImg && firstImg.type === "image") {
    doc.feedThumbnailSrc = firstImg.src;
  }
  return doc;
}

function toDiscoverItem(it: SpItem): ExternalBoardDiscoverItem | null {
  const id = itemId(it);
  const title = String(it.Title ?? "").replace(/\s+/g, " ").trim();
  if (!id || !title) return null;
  const doc = documentFromItem(it);
  if (!doc) return null;
  return {
    stableArticleIdentity: `stable:bsp-media-${id}`,
    identityKind: "stable_id",
    canonicalUrl: canonicalFor(id),
    title,
    sourceAuthor: ORG_AUTHOR,
    sourcePublishedAt: parseExternalBoardSourceDate(it.PDate || null),
    sampleDocument: doc,
  };
}

async function fetchItemById(id: number): Promise<SpItem | null> {
  const json = await fetchSpJson<{ d?: SpItem }>(
    `${LIST}(${id})?$select=Id,Title,PDate,Content,Tag,LocalLanguage`
  );
  return json?.d ?? null;
}

async function discoverEnglish(opts: ReturnType<typeof normalizeDiscoverOpts>): Promise<ExternalBoardDiscoverItem[]> {
  const collected: ExternalBoardDiscoverItem[] = [];
  let cursor: number | null = null;
  let guard = 0;
  while (collected.length < opts.limit && guard < 12) {
    guard += 1;
    const odataFilter: string =
      cursor == null
        ? "Tag eq 'Media Releases'"
        : `Tag eq 'Media Releases' and Id lt ${cursor}`;
    const url: string = `${LIST}?$top=20&$orderby=Id desc&$filter=${encodeURIComponent(odataFilter)}&$select=Id,Title,PDate,Content,Tag,LocalLanguage`;
    const json = await fetchSpJson<{ d?: { results?: SpItem[] } }>(url);
    const rows: SpItem[] = json?.d?.results ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      cursor = itemId(row) ?? cursor;
      if (row.LocalLanguage === true) continue;
      const item = toDiscoverItem(row);
      if (!item) continue;
      if (!withinDateRange(item.sourcePublishedAt, opts.dateFrom, opts.dateTo)) continue;
      collected.push(item);
      if (collected.length >= opts.limit) break;
    }
    if (rows.length < 20) break;
  }
  return collected;
}

async function discoverFilipino(opts: ReturnType<typeof normalizeDiscoverOpts>): Promise<ExternalBoardDiscoverItem[]> {
  const collected: ExternalBoardDiscoverItem[] = [];
  const json = await fetchSpJson<{ d?: { results?: SpItem[] } }>(
    `${PR_TRANSLATIONS}?$top=40&$orderby=Id desc&$select=Id,Title,English,Filipino`
  );
  const rows: SpItem[] = json?.d?.results ?? [];
  for (const row of rows) {
    if (collected.length >= opts.limit) break;
    const filId = Number(row.Filipino || 0);
    if (!Number.isFinite(filId) || filId <= 0) continue;
    const full = await fetchItemById(filId);
    if (!full) continue;
    const item = toDiscoverItem(full);
    if (!item) continue;
    if (!withinDateRange(item.sourcePublishedAt, opts.dateFrom, opts.dateTo)) continue;
    collected.push(item);
  }
  return collected;
}

export const bspMediaReleasesAdapter: ExternalBoardAdapter = {
  id: "bsp-media-releases",
  matches: (ctx: ExternalBoardAdapterContext) => {
    if (!(ctx.siteKey.includes(HOST) || ctx.sourceUrl.includes(HOST))) return false;
    return modeFromCtx(ctx) != null;
  },
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 2) return { status: "READY", reasons: ["bsp_media_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["bsp_media_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["bsp_media_no_samples"], samples: [] };
  },
  async discoverArticles(ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const mode = modeFromCtx(ctx) ?? "en_media";
    if (mode === "fil_media") return discoverFilipino(n);
    return discoverEnglish(n);
  },
  async fetchArticleDocument(_ctx, item) {
    if (item.sampleDocument) return item.sampleDocument;
    const m = String(item.stableArticleIdentity || "").match(/bsp-media-(\d+)/);
    const id = m ? Number(m[1]) : Number(String(item.canonicalUrl).match(/ItemId=(\d+)/i)?.[1] || 0);
    if (!id) {
      return {
        title: item.title || "BSP media release",
        canonicalUrl: item.canonicalUrl,
        nodes: [],
      };
    }
    const full = await fetchItemById(id);
    return documentFromItem(full || {}) || {
      title: item.title || "BSP media release",
      canonicalUrl: canonicalFor(id),
      nodes: [],
    };
  },
};
