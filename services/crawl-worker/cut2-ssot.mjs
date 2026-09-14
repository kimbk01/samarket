/**
 * CUT 2 — Crawlee result → Supabase product SSOT
 *
 * Admin UI / Community publish / Production worker hosting / Philgo bypass: OUT OF SCOPE
 *
 * Run from repo root:
 *   npx tsx services/crawl-worker/cut2-ssot.mjs
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { CheerioCrawler, Configuration } from "crawlee";
import * as cheerio from "cheerio";
import { philsamoAdapter, philsamoBoards, PHILSAMO_LIST_SELECTORS } from "../../lib/external-import/adapters/philsamo.ts";
import {
  helloCebuAdapter,
  helloCebuBoards,
  helloCebuDetailApiUrl,
  helloCebuListApiUrl,
  classifyHelloCebuThumbCases,
} from "../../lib/external-import/adapters/hellocebuph.ts";
import { normalizeDetailDocument, normalizeListArticle, countNodes } from "../../lib/external-import/document-normalize.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../../.tmp/external-import-cut2");
mkdirSync(OUT_DIR, { recursive: true });
Configuration.getGlobalConfig().set("persistStorage", false);

function loadEnvLocal() {
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

function writeJson(name, data) {
  const p = join(OUT_DIR, name);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function sbAdmin() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const WORKER_ID = `crawl-worker-local:${process.pid}`;

async function claimJob(sb, jobId) {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("external_import_jobs")
    .update({
      status: "running",
      claimed_by: WORKER_ID,
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

async function completeJob(sb, jobId, resultSummary) {
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

async function failJob(sb, jobId, err) {
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

async function enqueueJob(sb, row) {
  const { data, error } = await sb
    .from("external_import_jobs")
    .insert({ ...row, status: "queued" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

async function seedSitesBoards(sb) {
  const ph = philsamoAdapter.site;
  const hc = helloCebuAdapter.site;

  const upsertSite = async (site) => {
    const { data, error } = await sb
      .from("external_sites")
      .upsert(
        {
          country_code: site.countryCode,
          site_key: site.siteKey,
          name: site.name,
          base_url: site.baseUrl,
          engine: site.engine,
          adapter_key: site.adapterKey,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_key" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  };

  const phSite = await upsertSite(ph);
  const hcSite = await upsertSite(hc);

  const upsertBoard = async (siteId, board) => {
    const { data, error } = await sb
      .from("external_boards")
      .upsert(
        {
          site_id: siteId,
          board_key: board.boardKey,
          name: board.name,
          list_url: board.listUrl,
          topic_hint: board.topicHint ?? null,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "site_id,board_key" }
      )
      .select("*")
      .single();
    if (error) throw error;
    return data;
  };

  const phBoard = await upsertBoard(phSite.id, philsamoBoards[0]);
  const hcBoard = await upsertBoard(hcSite.id, helloCebuBoards[0]);

  return {
    philsamo: { site: phSite, board: phBoard },
    hellocebuph: { site: hcSite, board: hcBoard },
    philgo: { status: "BLOCKED", seeded: false },
  };
}

function toPublishedAt(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  // MM.DD without year — not a reliable timestamptz
  if (/^\d{2}\.\d{2}$/.test(s)) return null;
  return null;
}

async function upsertArticles(sb, { siteId, boardId, articles }) {
  const now = new Date().toISOString();
  const rows = articles.map((a) => ({
    site_id: siteId,
    board_id: boardId,
    external_article_key: a.externalArticleKey,
    canonical_url: a.canonicalUrl,
    title: a.title,
    author: a.author,
    published_at: toPublishedAt(a.sourcePublishedAt),
    thumbnail_candidate: a.thumbnailUrl,
    list_page: a.listPage ?? 1,
    list_fetched_at: now,
    updated_at: now,
  }));
  const { data, error } = await sb
    .from("external_articles")
    .upsert(rows, { onConflict: "site_id,board_id,external_article_key" })
    .select("id, external_article_key, title, author, published_at, thumbnail_candidate");
  if (error) throw error;
  return data;
}

async function runCheerioList(url, parseHtml, label = "list") {
  let html = "";
  let loadedUrl = url;
  const uniqueKey = `${label}:${url}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    additionalMimeTypes: ["application/json", "application/json; charset=utf-8"],
    async requestHandler({ request, body, $ }) {
      loadedUrl = request.loadedUrl || request.url;
      if (typeof body === "string") html = body;
      else if (Buffer.isBuffer(body)) html = body.toString("utf8");
      else if (body != null) html = String(body);
      else if ($) html = $.html();
      else html = "";
    },
  });
  await crawler.run([{ url, uniqueKey }]);
  if (!html || !html.trim()) {
    throw new Error(`empty_body:${label}:${url}`);
  }
  return { html, loadedUrl, articles: parseHtml(html, loadedUrl) };
}

async function runListJob(sb, { siteKey, siteId, boardId, board, adapter }) {
  const job = await enqueueJob(sb, {
    site_id: siteId,
    board_id: boardId,
    action: "list",
    payload: { siteKey, boardKey: board.boardKey, listUrl: board.listUrl },
  });
  const transition = { id: job.id, steps: ["queued"] };
  await claimJob(sb, job.id);
  transition.steps.push("running");

  try {
    const { html, loadedUrl, articles: raw } = await runCheerioList(
      board.listUrl,
      (h, u) => adapter.fetchArticleList({ board, html: h, pageUrl: u }).map(normalizeListArticle),
      `list1:${siteKey}`
    );
    const articles = raw.slice(0, 20);
    if (articles.length < 1) throw new Error(`list_empty:${siteKey}`);
    const upserted = await upsertArticles(sb, { siteId, boardId, articles });

    // second list run → dedupe proof
    const { articles: raw2 } = await runCheerioList(
      board.listUrl,
      (h, u) => adapter.fetchArticleList({ board, html: h, pageUrl: u }).map(normalizeListArticle),
      `list2:${siteKey}`
    );
    const upserted2 = await upsertArticles(sb, { siteId, boardId, articles: raw2.slice(0, 20) });

    const { count: rowCount, error: cErr } = await sb
      .from("external_articles")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("board_id", boardId);
    if (cErr) throw cErr;

    // duplicate keys check
    const { data: keys } = await sb
      .from("external_articles")
      .select("external_article_key")
      .eq("site_id", siteId)
      .eq("board_id", boardId);
    const keyList = (keys || []).map((k) => k.external_article_key);
    const dupes = keyList.length - new Set(keyList).size;

    const summary = {
      siteKey,
      listUrl: board.listUrl,
      loadedUrl,
      listCount: articles.length,
      upsertedFirst: upserted.length,
      upsertedSecond: upserted2.length,
      boardRowCount: rowCount,
      duplicateKeys: dupes,
      sample: articles.slice(0, 5),
      htmlBytes: html.length,
    };
    await completeJob(sb, job.id, summary);
    transition.steps.push("completed");
    return { jobId: job.id, transition, articles, upserted, summary, html };
  } catch (e) {
    await failJob(sb, job.id, e);
    transition.steps.push("failed");
    throw e;
  }
}

async function runDetailJob(sb, { siteKey, siteId, boardId, article, fetchUrl, adapter, listArticle }) {
  const job = await enqueueJob(sb, {
    site_id: siteId,
    board_id: boardId,
    action: "detail",
    payload: {
      siteKey,
      externalArticleKey: article.external_article_key,
      articleId: article.id,
      url: fetchUrl,
    },
  });
  const transition = { id: job.id, steps: ["queued"] };
  await claimJob(sb, job.id);
  transition.steps.push("running");

  try {
    let html = "";
    let loadedUrl = fetchUrl;
    const crawler = new CheerioCrawler({
      maxRequestsPerCrawl: 1,
      additionalMimeTypes: ["application/json", "application/json; charset=utf-8"],
      async requestHandler({ request, body, $ }) {
        loadedUrl = request.loadedUrl || request.url;
        if (typeof body === "string") html = body;
        else if (Buffer.isBuffer(body)) html = body.toString("utf8");
        else if (body != null) html = String(body);
        else if ($) html = $.html();
        else html = "";
      },
    });
    await crawler.run([{ url: fetchUrl, uniqueKey: `detail:${siteKey}:${article.id}:${Date.now()}` }]);
    if (!html.trim()) throw new Error(`empty_detail_body:${siteKey}:${article.external_article_key}`);

    const detail = normalizeDetailDocument(
      adapter.fetchArticleDetail({
        article: listArticle,
        html,
        pageUrl: loadedUrl,
      })
    );

    const sourceDiff = buildSourceDiff({ siteKey, html, detail });

    const now = new Date().toISOString();
    const docRow = {
      article_id: article.id,
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
      fetched_at: now,
      updated_at: now,
    };

    const { data: doc, error: dErr } = await sb
      .from("external_article_documents")
      .upsert(docRow, { onConflict: "article_id" })
      .select("id, article_id, title, author, published_at, canonical_url, body_image_urls, gallery_image_urls, nodes, media_meta")
      .single();
    if (dErr) throw dErr;

    await sb
      .from("external_articles")
      .update({
        title: detail.title,
        author: detail.author,
        published_at: toPublishedAt(detail.sourcePublishedAt),
        thumbnail_candidate: detail.thumbnailUrl,
        detail_fetched_at: now,
        updated_at: now,
      })
      .eq("id", article.id);

    const summary = {
      siteKey,
      articleId: article.id,
      externalArticleKey: article.external_article_key,
      documentId: doc.id,
      imageCounts: {
        body: detail.bodyImageUrls.length,
        gallery: detail.galleryImageUrls.length,
      },
      nodeCounts: countNodes(detail.nodes),
      sourceDiff,
    };
    await completeJob(sb, job.id, summary);
    transition.steps.push("completed");
    return { jobId: job.id, transition, detail, doc, sourceDiff, html };
  } catch (e) {
    await failJob(sb, job.id, e);
    transition.steps.push("failed");
    throw e;
  }
}

function buildSourceDiff({ siteKey, html, detail }) {
  if (siteKey === "philsamo") {
    const $ = cheerio.load(html);
    const $body = $("#bo_v_con, .view-content, #view_content").first();
    const sourceTitle =
      $("#bo_v_title").text().replace(/\s+/g, " ").trim() || $("h1").first().text().replace(/\s+/g, " ").trim();
    const sourceAuthor = $(".bo_v_info .sv_member, .view-wrap .sv_member").first().text().replace(/\s+/g, " ").replace(/\d+\s*레벨\s*이미지/g, "").trim();
    const sourceImages = [];
    $body.find("img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (!src) return;
      const low = src.toLowerCase();
      if (["icon", "btn", "logo", "emoji", "profile", "avatar", "banner", "level/"].some((d) => low.includes(d))) return;
      try {
        sourceImages.push(new URL(src, "https://philsamo.com").toString());
      } catch {
        sourceImages.push(src);
      }
    });
    const sourceParagraphs = $body.find("> p").length;
    const sourceHeadings = $body.find("h1,h2,h3,h4,h5,h6").length;
    const sourceLists = $body.find("ul,ol").length;
    const nodeC = countNodes(detail.nodes);
    return {
      source: {
        title: sourceTitle,
        author: sourceAuthor || null,
        paragraphCount: sourceParagraphs,
        headingCount: sourceHeadings,
        listCount: sourceLists,
        imageCount: sourceImages.length,
        galleryCount: 0,
        imageOrder: sourceImages,
      },
      normalized: {
        title: detail.title,
        author: detail.author,
        paragraphCount: nodeC.paragraph,
        headingCount: nodeC.heading,
        listCount: nodeC.list,
        imageCount: detail.bodyImageUrls.length,
        galleryCount: detail.galleryImageUrls.length,
        imageOrder: detail.bodyImageUrls,
      },
      imageOrderMatch: JSON.stringify(sourceImages) === JSON.stringify(detail.bodyImageUrls),
      titleMatch: sourceTitle === detail.title,
      authorMatch: Boolean(sourceAuthor) && sourceAuthor === detail.author,
    };
  }

  if (siteKey === "hellocebuph") {
    const p = JSON.parse(html);
    const $ = cheerio.load(`<body>${p.content?.rendered || ""}</body>`);
    const sourceImages = [];
    $("img").each((_, img) => {
      const src = $(img).attr("src") || $(img).attr("data-src");
      if (!src) return;
      const low = src.toLowerCase();
      if (["logo", "avatar", "emoji", "gravatar", "wp-smiley", "icon"].some((d) => low.includes(d))) return;
      try {
        sourceImages.push(new URL(src, "https://hellocebuph.com").toString());
      } catch {
        sourceImages.push(src);
      }
    });
    const sourceParagraphs = $("p").length;
    const sourceHeadings = $("h1,h2,h3,h4,h5,h6").length;
    const sourceLists = $("ul,ol").length;
    const nodeC = countNodes(detail.nodes);
    const sourceTitle = cheerio.load(`<textarea>${p.title?.rendered || ""}</textarea>`)("textarea").text().trim();
    const sourceAuthor = p._embedded?.author?.[0]?.name ?? null;
    return {
      source: {
        title: sourceTitle,
        author: sourceAuthor,
        date: p.date ?? null,
        paragraphCount: sourceParagraphs,
        headingCount: sourceHeadings,
        listCount: sourceLists,
        imageCount: sourceImages.length,
        galleryCount: 0,
        imageOrder: sourceImages,
      },
      normalized: {
        title: detail.title,
        author: detail.author,
        date: detail.sourcePublishedAt,
        paragraphCount: nodeC.paragraph,
        headingCount: nodeC.heading,
        listCount: nodeC.list,
        imageCount: detail.bodyImageUrls.length,
        galleryCount: detail.galleryImageUrls.length,
        imageOrder: detail.bodyImageUrls,
      },
      imageOrderMatch: JSON.stringify(sourceImages) === JSON.stringify(detail.bodyImageUrls),
      titleMatch: sourceTitle === detail.title,
      authorMatch: sourceAuthor === detail.author,
      dateMatch: (p.date ?? null) === detail.sourcePublishedAt,
    };
  }

  return { error: "unknown_site" };
}

function analyzePhilsamoListContract(html) {
  const $ = cheerio.load(html);
  const mainRows = $(PHILSAMO_LIST_SELECTORS.row).length;
  const withAuthor = $(PHILSAMO_LIST_SELECTORS.row).filter((_, el) => $(el).find(PHILSAMO_LIST_SELECTORS.author).text().trim()).length;
  const withDate = $(PHILSAMO_LIST_SELECTORS.row).filter((_, el) => $(el).find(PHILSAMO_LIST_SELECTORS.date).text().trim()).length;
  const widgetItems = $(".list-user-widget-box .post-list li").length;
  return {
    verdictBranch: "A_list_html_has_author_and_date_in_list_row",
    selectors: PHILSAMO_LIST_SELECTORS,
    counts: { mainRows, withAuthor, withDate, widgetItemsNoAuthorAuthority: widgetItems },
    note: "Product list must use .list-board .list-row cards, not popular widget .post-list",
  };
}

// ---------- main ----------
const sb = sbAdmin();
const seeded = await seedSitesBoards(sb);
writeJson("seed.json", seeded);

const phList = await runListJob(sb, {
  siteKey: "philsamo",
  siteId: seeded.philsamo.site.id,
  boardId: seeded.philsamo.board.id,
  board: philsamoBoards[0],
  adapter: philsamoAdapter,
});
const phListContract = analyzePhilsamoListContract(phList.html);
writeJson("philsamo-list.json", {
  job: phList.transition,
  summary: phList.summary,
  listContract: phListContract,
  articles: phList.articles,
});

const hcList = await runListJob(sb, {
  siteKey: "hellocebuph",
  siteId: seeded.hellocebuph.site.id,
  boardId: seeded.hellocebuph.board.id,
  board: { ...helloCebuBoards[0], listUrl: helloCebuListApiUrl(12) },
  adapter: helloCebuAdapter,
});
const thumbCases = classifyHelloCebuThumbCases(hcList.html);
writeJson("hellocebuph-list.json", {
  job: hcList.transition,
  summary: hcList.summary,
  thumbCases,
  articles: hcList.articles,
});

// pick detail targets: philsamo first with author; hello first
const phTarget =
  phList.upserted.find((a) => a.author) || phList.upserted[0];
const phListArt = phList.articles.find((a) => a.externalArticleKey === phTarget.external_article_key) || phList.articles[0];
const phDetail = await runDetailJob(sb, {
  siteKey: "philsamo",
  siteId: seeded.philsamo.site.id,
  boardId: seeded.philsamo.board.id,
  article: phTarget,
  fetchUrl: phListArt.canonicalUrl,
  adapter: philsamoAdapter,
  listArticle: phListArt,
});
writeJson("philsamo-detail.json", {
  job: phDetail.transition,
  documentId: phDetail.doc.id,
  articleId: phDetail.doc.article_id,
  sourceDiff: phDetail.sourceDiff,
  detail: {
    title: phDetail.detail.title,
    author: phDetail.detail.author,
    bodyImages: phDetail.detail.bodyImageUrls,
    gallery: phDetail.detail.galleryImageUrls,
    nodeCounts: countNodes(phDetail.detail.nodes),
  },
});

const hcTarget = hcList.upserted[0];
const hcListArt = hcList.articles.find((a) => a.externalArticleKey === hcTarget.external_article_key) || hcList.articles[0];
const hcDetail = await runDetailJob(sb, {
  siteKey: "hellocebuph",
  siteId: seeded.hellocebuph.site.id,
  boardId: seeded.hellocebuph.board.id,
  article: hcTarget,
  fetchUrl: helloCebuDetailApiUrl(hcTarget.external_article_key),
  adapter: helloCebuAdapter,
  listArticle: hcListArt,
});
writeJson("hellocebuph-detail.json", {
  job: hcDetail.transition,
  documentId: hcDetail.doc.id,
  articleId: hcDetail.doc.article_id,
  sourceDiff: hcDetail.sourceDiff,
  mediaMeta: hcDetail.detail.mediaMeta,
  detail: {
    title: hcDetail.detail.title,
    author: hcDetail.detail.author,
    bodyImages: hcDetail.detail.bodyImageUrls,
    nodeCounts: countNodes(hcDetail.detail.nodes),
  },
});

// optional: detail a first_content_img case if present
let hcThumbAlt = null;
if (thumbCases.firstContent[0]) {
  const alt = hcList.upserted.find((a) => a.external_article_key === thumbCases.firstContent[0]);
  if (alt) {
    const la = hcList.articles.find((a) => a.externalArticleKey === alt.external_article_key);
    hcThumbAlt = await runDetailJob(sb, {
      siteKey: "hellocebuph",
      siteId: seeded.hellocebuph.site.id,
      boardId: seeded.hellocebuph.board.id,
      article: alt,
      fetchUrl: helloCebuDetailApiUrl(alt.external_article_key),
      adapter: helloCebuAdapter,
      listArticle: la,
    });
  }
}

const summary = {
  cut: 2,
  outDir: OUT_DIR,
  migrationExpected: "20261230150000_external_import_crawlee_foundation.sql",
  seed: {
    philsamo: { siteId: seeded.philsamo.site.id, boardId: seeded.philsamo.board.id },
    hellocebuph: { siteId: seeded.hellocebuph.site.id, boardId: seeded.hellocebuph.board.id },
    philgo: "BLOCKED_NOT_SEEDED",
  },
  jobs: {
    philsamoList: phList.transition,
    helloList: hcList.transition,
    philsamoDetail: phDetail.transition,
    helloDetail: hcDetail.transition,
  },
  philsamoListContract: phListContract,
  philsamoListAuthorsNonNull: phList.articles.filter((a) => a.author).length,
  philsamoListDatesNonNull: phList.articles.filter((a) => a.sourcePublishedAt).length,
  duplicates: {
    philsamo: phList.summary.duplicateKeys,
    hellocebuph: hcList.summary.duplicateKeys,
  },
  thumbCases,
  hcThumbAltRule: hcThumbAlt?.detail?.mediaMeta?.thumbnailAuthority ?? null,
  imageExtraction: {
    philsamo: {
      orderMatch: phDetail.sourceDiff.imageOrderMatch,
      sourceCount: phDetail.sourceDiff.source.imageCount,
      normalizedCount: phDetail.sourceDiff.normalized.imageCount,
    },
    hellocebuph: {
      orderMatch: hcDetail.sourceDiff.imageOrderMatch,
      sourceCount: hcDetail.sourceDiff.source.imageCount,
      normalizedCount: hcDetail.sourceDiff.normalized.imageCount,
    },
  },
};

writeJson("cut2-summary.json", summary);
console.log(JSON.stringify(summary, null, 2));
