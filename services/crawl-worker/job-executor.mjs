/**
 * Shared job executor for crawl-worker (NOT imported by Next).
 * Crawlee + adapter + external_* persist.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { CheerioCrawler, Configuration, PlaywrightCrawler } from "crawlee";
import { getSiteAdapter } from "../../lib/external-import/adapters/registry.ts";
import { helloCebuDetailApiUrl, helloCebuListApiUrl } from "../../lib/external-import/adapters/hellocebuph.ts";
import { normalizeDetailDocument, normalizeListArticle } from "../../lib/external-import/document-normalize.ts";

Configuration.getGlobalConfig().set("persistStorage", false);

export function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

export function sbAdmin() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("missing_supabase_env");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function makeWorkerId(prefix = "crawl-worker") {
  return `${prefix}:${process.pid}`;
}

function toPublishedAt(v) {
  if (!v) return null;
  const d = new Date(String(v));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

async function crawlHtml(url, engine) {
  let html = "";
  let loadedUrl = url;
  if (engine === "playwright") {
    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 1,
      headless: true,
      async requestHandler({ page, request }) {
        await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: 45000 });
        html = await page.content();
        loadedUrl = page.url();
      },
    });
    await crawler.run([url]);
  } else {
    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: 1,
      async requestHandler({ body, request }) {
        html = typeof body === "string" ? body : String(body ?? "");
        loadedUrl = request.loadedUrl || request.url;
      },
    });
    await crawler.run([url]);
  }
  if (!String(html || "").trim()) throw new Error("empty_response");
  return { html, loadedUrl };
}

export async function claimJobById(sb, jobId, workerId) {
  const now = new Date().toISOString();
  // Single-row conditional UPDATE is atomic for a known id (status must still be queued).
  const { data, error } = await sb
    .from("external_import_jobs")
    .update({
      status: "running",
      claimed_by: workerId,
      claimed_at: now,
      started_at: now,
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`claim_failed:${jobId}`);
  return data;
}

/**
 * Atomically claim the oldest queued job.
 * Mechanism: RPC claim_external_import_job — CTE + FOR UPDATE SKIP LOCKED + UPDATE RETURNING.
 * Two workers cannot claim the same row.
 */
export async function claimNextQueuedJob(sb, workerId) {
  const { data, error } = await sb.rpc("claim_external_import_job", {
    p_worker_id: workerId,
  });
  if (error) throw error;
  // PostgREST may return null, object, or single-element array depending on return shape.
  if (data == null) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

/**
 * If worker process died mid-job, reclaim stale `running` rows to `queued`.
 * Default stale window: 15 minutes.
 */
export async function reclaimStaleRunningJobs(sb, staleMs = 15 * 60 * 1000) {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  const { data, error } = await sb
    .from("external_import_jobs")
    .update({
      status: "queued",
      claimed_by: null,
      claimed_at: null,
      started_at: null,
      updated_at: new Date().toISOString(),
      error: "reclaimed_stale_running",
    })
    .eq("status", "running")
    .lt("claimed_at", cutoff)
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

export async function completeJob(sb, jobId, resultSummary) {
  const now = new Date().toISOString();
  const { error } = await sb
    .from("external_import_jobs")
    .update({
      status: "completed",
      result_summary: resultSummary,
      error: null,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", jobId);
  if (error) throw error;
}

export async function failJob(sb, jobId, err) {
  const now = new Date().toISOString();
  await sb
    .from("external_import_jobs")
    .update({
      status: "failed",
      error: String(err?.message || err),
      completed_at: now,
      updated_at: now,
    })
    .eq("id", jobId);
}

async function runList(sb, job) {
  const { data: board } = await sb
    .from("external_boards")
    .select("id, site_id, board_key, list_url, name")
    .eq("id", job.board_id)
    .maybeSingle();
  if (!board) throw new Error("board_not_found");

  const { data: site } = await sb
    .from("external_sites")
    .select("id, adapter_key, site_key, engine")
    .eq("id", board.site_id)
    .maybeSingle();
  if (!site) throw new Error("site_not_found");

  const adapter = getSiteAdapter(site.adapter_key);
  const payload = job.payload || {};
  const mode = String(payload.mode || "recent");
  const engine = site.engine === "playwright" ? "playwright" : "cheerio";
  const boardDef = {
    siteKey: site.site_key,
    boardKey: board.board_key,
    name: board.name,
    listUrl: board.list_url,
  };

  let articles = [];

  if (site.adapter_key === "hellocebuph") {
    const limit = Math.min(50, Math.max(1, Number(payload.limit || 20)));
    let listUrl = helloCebuListApiUrl(limit);
    if (mode === "date" && payload.dateFrom && payload.dateTo) {
      const u = new URL(listUrl);
      u.searchParams.set("after", `${payload.dateFrom}T00:00:00`);
      u.searchParams.set("before", `${payload.dateTo}T23:59:59`);
      u.searchParams.set("per_page", String(limit));
      listUrl = u.toString();
    }
    const { html, loadedUrl } = await crawlHtml(listUrl, "cheerio");
    articles = adapter
      .fetchArticleList({ board: boardDef, html, pageUrl: loadedUrl })
      .map(normalizeListArticle)
      .slice(0, limit);
  } else if (mode === "page") {
    const pageFrom = Math.max(1, Number(payload.pageFrom || 1));
    const pageTo = Math.max(pageFrom, Number(payload.pageTo || pageFrom));
    let pageUrl = board.list_url;
    const u0 = new URL(pageUrl);
    u0.searchParams.set("page", String(pageFrom));
    pageUrl = u0.toString();
    for (let page = pageFrom; page <= pageTo; page++) {
      const { html, loadedUrl } = await crawlHtml(pageUrl, engine);
      const pageArticles = adapter
        .fetchArticleList({ board: boardDef, html, pageUrl: loadedUrl })
        .map(normalizeListArticle);
      articles.push(...pageArticles);
      if (page < pageTo && adapter.nextListPageUrl) {
        const next = adapter.nextListPageUrl({ board: boardDef, pageUrl: loadedUrl, html });
        if (!next) break;
        pageUrl = next;
      } else if (page < pageTo) {
        const u = new URL(board.list_url);
        u.searchParams.set("page", String(page + 1));
        pageUrl = u.toString();
      }
    }
  } else {
    const limit = Math.min(50, Math.max(1, Number(payload.limit || 20)));
    const { html, loadedUrl } = await crawlHtml(board.list_url, engine);
    articles = adapter
      .fetchArticleList({ board: boardDef, html, pageUrl: loadedUrl })
      .map(normalizeListArticle)
      .slice(0, limit);
  }

  const seen = new Set();
  articles = articles.filter((a) => {
    if (seen.has(a.externalArticleKey)) return false;
    seen.add(a.externalArticleKey);
    return true;
  });

  const ts = new Date().toISOString();
  const rows = articles.map((a) => ({
    site_id: site.id,
    board_id: board.id,
    external_article_key: a.externalArticleKey,
    canonical_url: a.canonicalUrl,
    title: a.title,
    author: a.author,
    published_at: toPublishedAt(a.sourcePublishedAt),
    thumbnail_candidate: a.thumbnailUrl,
    list_page: a.listPage ?? 1,
    list_fetched_at: ts,
    updated_at: ts,
  }));

  if (rows.length) {
    const { error } = await sb.from("external_articles").upsert(rows, {
      onConflict: "site_id,board_id,external_article_key",
    });
    if (error) throw error;
  }

  return {
    listCount: articles.length,
    mode,
    sampleKeys: articles.slice(0, 5).map((a) => a.externalArticleKey),
    engine,
  };
}

async function runDetail(sb, job) {
  const articleId = String(job.payload?.articleId || "").trim();
  if (!articleId) throw new Error("articleId_required");

  const { data: article } = await sb.from("external_articles").select("*").eq("id", articleId).maybeSingle();
  if (!article) throw new Error("article_not_found");
  if (article.board_id !== job.board_id) throw new Error("article_board_mismatch");

  const { data: site } = await sb
    .from("external_sites")
    .select("adapter_key, site_key, engine")
    .eq("id", article.site_id)
    .maybeSingle();
  if (!site) throw new Error("site_not_found");

  const adapter = getSiteAdapter(site.adapter_key);
  const engine = site.engine === "playwright" ? "playwright" : "cheerio";
  const listArticle = {
    externalArticleKey: article.external_article_key,
    canonicalUrl: article.canonical_url,
    title: article.title,
    author: article.author,
    sourcePublishedAt: article.published_at,
    thumbnailUrl: article.thumbnail_candidate,
  };

  let fetchUrl = article.canonical_url;
  if (site.adapter_key === "hellocebuph") {
    fetchUrl = helloCebuDetailApiUrl(article.external_article_key);
  }

  const { html, loadedUrl } = await crawlHtml(fetchUrl, engine);
  const detail = normalizeDetailDocument(
    adapter.fetchArticleDetail({ article: listArticle, html, pageUrl: loadedUrl })
  );

  const ts = new Date().toISOString();
  const { error: dErr } = await sb.from("external_article_documents").upsert(
    {
      article_id: articleId,
      title: detail.title,
      author: detail.author,
      published_at: toPublishedAt(detail.sourcePublishedAt),
      canonical_url: detail.canonicalUrl,
      source_document: {
        title: detail.title,
        author: detail.author,
        published_at: detail.sourcePublishedAt,
        canonical_url: detail.canonicalUrl,
        nodes: detail.nodes,
      },
      body_html: detail.bodyHtml,
      body_text: detail.bodyText,
      thumbnail_url: detail.thumbnailUrl,
      body_image_urls: detail.bodyImageUrls,
      gallery_image_urls: detail.galleryImageUrls,
      media_meta: detail.mediaMeta,
      nodes: detail.nodes,
      fetched_at: ts,
      updated_at: ts,
    },
    { onConflict: "article_id" }
  );
  if (dErr) throw dErr;

  await sb
    .from("external_articles")
    .update({
      title: detail.title,
      author: detail.author,
      published_at: toPublishedAt(detail.sourcePublishedAt),
      thumbnail_candidate: detail.thumbnailUrl,
      detail_fetched_at: ts,
      updated_at: ts,
    })
    .eq("id", articleId);

  return {
    articleId,
    title: detail.title,
    imageCount: detail.bodyImageUrls.length,
    nodeCount: detail.nodes.length,
    engine,
  };
}

/** Execute an already-claimed job row. */
export async function executeClaimedJob(sb, claimed) {
  if (claimed.action === "list") return runList(sb, claimed);
  if (claimed.action === "detail") return runDetail(sb, claimed);
  throw new Error(`unsupported_action:${claimed.action}`);
}
