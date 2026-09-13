import * as cheerio from "cheerio";
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import { fetchExternalBoardHtml } from "@/lib/external-board-import/extraction/fetch-html";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import { buildDocumentFromHtml, extractOgTitle } from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem } from "@/lib/external-board-import/types";

type FlarumDiscussion = {
  id: string;
  attributes?: {
    title?: string;
    slug?: string;
    createdAt?: string;
  };
};

type FlarumListResponse = {
  data?: FlarumDiscussion[];
  included?: Array<{
    type?: string;
    id?: string;
    attributes?: { contentHtml?: string; content?: string; createdAt?: string };
    relationships?: { user?: { data?: { id?: string } } };
  }>;
};

async function fetchFlarumJson(url: string): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        accept: "application/vnd.api+json, application/json",
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true, json: await res.json() };
  } catch (e) {
    return { ok: false, error: String((e as Error).message || e) };
  }
}

async function fetchDiscussion(item: ExternalBoardDiscoverItem): Promise<ExternalBoardDiscoverItem> {
  const fetched = await fetchExternalBoardHtml(item.canonicalUrl);
  if (!fetched.ok) return { ...item, sampleDocument: null };
  const $ = cheerio.load(fetched.html);
  const title = ($("h1").first().text() || extractOgTitle(fetched.html) || item.title).replace(/\s+/g, " ").trim();
  const firstPost = $("article").first();
  const author = firstPost.find(".PostUser-name").first().text().replace(/\s+/g, " ").trim() || null;
  let sourcePublishedAt: string | null = item.sourcePublishedAt ?? null;
  const timeEl = firstPost.find("time").first();
  const dt = timeEl.attr("datetime") || timeEl.text();
  const parsed = parseExternalBoardSourceDate(dt || null);
  if (parsed) sourcePublishedAt = parsed;
  if (!sourcePublishedAt) {
    const jsonLd = $('script[type="application/ld+json"]').first().html();
    if (jsonLd) {
      try {
        const parsedLd = JSON.parse(jsonLd) as Record<string, unknown>;
        const graphRaw = parsedLd["@graph"];
        const graph = Array.isArray(graphRaw) ? (graphRaw as Array<Record<string, unknown>>) : [parsedLd];
        for (const node of graph) {
          const d = String(node.datePublished ?? node.dateCreated ?? "").trim();
          if (d) {
            sourcePublishedAt = parseExternalBoardSourceDate(d);
            if (sourcePublishedAt) break;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  const articleHtml = $.html(firstPost.length ? firstPost : $("body"));
  const wrapped = `<div id="pinoy-post-root">${articleHtml}</div>`;
  const bodyOnly = buildDocumentFromHtml({
    title,
    canonicalUrl: item.canonicalUrl,
    html: wrapped,
    baseUrl: fetched.finalUrl,
    rootSelector: "#pinoy-post-root .Post-body",
  });
  const fallback = buildDocumentFromHtml({
    title,
    canonicalUrl: item.canonicalUrl,
    html: wrapped,
    baseUrl: fetched.finalUrl,
    rootSelector: "#pinoy-post-root",
  });
  const useDoc = bodyOnly.nodes.length ? bodyOnly : fallback;
  return {
    ...item,
    title,
    sourceAuthor: author || item.sourceAuthor || null,
    sourcePublishedAt,
    sampleDocument: useDoc.nodes.length ? useDoc : null,
  };
}

export const pinoyForumExternalBoardAdapter: ExternalBoardAdapter = {
  id: "pinoy-forum-flarum",
  matches: (ctx: ExternalBoardAdapterContext) =>
    ctx.siteKey === "pinoy.forum" || ctx.sourceUrl.includes("pinoy.forum"),
  async verifyBoard(ctx) {
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 3) return { status: "READY", reasons: ["pinoy_forum_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["pinoy_forum_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["pinoy_forum_no_samples"], samples: [] };
  },
  async discoverArticles(_ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const collected: ExternalBoardDiscoverItem[] = [];
    const pageSize = Math.min(20, n.limit);
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const offset = (page - 1) * pageSize;
      const apiUrl =
        `https://pinoy.forum/api/discussions?` +
        new URLSearchParams({
          "page[limit]": String(pageSize),
          "page[offset]": String(offset),
          include: "user",
        }).toString();
      const api = await fetchFlarumJson(apiUrl);
      if (!api.ok) break;
      const payload = api.json as FlarumListResponse;
      const discussions = Array.isArray(payload.data) ? payload.data : [];
      if (!discussions.length) break;
      const usersById = new Map<string, string>();
      for (const inc of payload.included ?? []) {
        if (inc.type === "users" && inc.id) {
          const name = String((inc.attributes as { displayName?: string; username?: string } | undefined)?.displayName
            || (inc.attributes as { username?: string } | undefined)?.username
            || "").trim();
          if (name) usersById.set(String(inc.id), name);
        }
      }
      for (const d of discussions) {
        const id = String(d.id ?? "").trim();
        const slug = String(d.attributes?.slug ?? id).trim();
        const title = String(d.attributes?.title ?? `Discussion ${id}`).trim();
        if (!id) continue;
        const sourcePublishedAt = parseExternalBoardSourceDate(d.attributes?.createdAt || null);
        if (!withinDateRange(sourcePublishedAt, n.dateFrom, n.dateTo)) continue;
        const userRel = (d as { relationships?: { user?: { data?: { id?: string } } } }).relationships?.user?.data?.id;
        const apiAuthor = userRel ? usersById.get(String(userRel)) || null : null;
        const canonicalUrl = `https://pinoy.forum/d/${slug}`;
        const base: ExternalBoardDiscoverItem = {
          stableArticleIdentity: `stable:pinoy-${id}`,
          identityKind: "stable_id",
          canonicalUrl,
          title,
          sourcePublishedAt,
          sourceAuthor: apiAuthor,
        };
        const full = await fetchDiscussion(base);
        collected.push({
          ...full,
          sourceAuthor: full.sourceAuthor || apiAuthor,
          sourcePublishedAt: full.sourcePublishedAt || sourcePublishedAt,
          sourcePage: page,
          sourceSequence: collected.length,
          visitedListUrl: apiUrl,
        });
        if (collected.length >= n.limit) break;
      }
    }
    return collected;
  },
  async fetchArticleDocument(_ctx, item) {
    const full = await fetchDiscussion(item);
    if (full.sampleDocument) return full.sampleDocument;
    throw Object.assign(new Error("pinoy_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
