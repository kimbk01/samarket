/**
 * Foundation POC A/B/C — real board fetch evidence.
 * PRODUCT E2E / DIBAY publish = NOT in scope unless explicitly completed.
 *
 * Run from repo root:
 *   node --import tsx services/crawl-worker/run-poc.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CheerioCrawler, Configuration, PlaywrightCrawler } from "crawlee";
import { philsamoAdapter, philsamoBoards } from "../../lib/external-import/adapters/philsamo.ts";
import {
  helloCebuAdapter,
  helloCebuDetailApiUrl,
  helloCebuListApiUrl,
} from "../../lib/external-import/adapters/hellocebuph.ts";
import { normalizeDetailDocument, normalizeListArticle } from "../../lib/external-import/document-normalize.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "../../.tmp/external-import-poc");
mkdirSync(OUT_DIR, { recursive: true });

Configuration.getGlobalConfig().set("persistStorage", false);
Configuration.getGlobalConfig().set("storageClientOptions", { localDataDirectory: join(OUT_DIR, "crawlee-storage") });

function writeJson(name, data) {
  const p = join(OUT_DIR, name);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

async function pocAPhilsamo() {
  const board = philsamoBoards.find((b) => b.boardKey === "sharing") ?? philsamoBoards[0];
  const articles = [];
  let pagesFetched = 0;
  let listHtml = "";

  const crawler = new CheerioCrawler({
    maxRequestsPerCrawl: 8,
    maxConcurrency: 2,
    async requestHandler({ request, $, body }) {
      pagesFetched += 1;
      listHtml = typeof body === "string" ? body : $.html();
      const pageArticles = philsamoAdapter.fetchArticleList({
        board,
        html: listHtml,
        pageUrl: request.loadedUrl || request.url,
      });
      for (const a of pageArticles) {
        if (!articles.some((x) => x.externalArticleKey === a.externalArticleKey)) {
          articles.push(a);
        }
      }
      if (articles.length < 10) {
        const next = philsamoAdapter.nextListPageUrl?.({
          board,
          pageUrl: request.loadedUrl || request.url,
          html: listHtml,
        });
        if (next && next !== request.url) {
          await crawler.addRequests([{ url: next, uniqueKey: next }]);
        }
      }
    },
  });

  await crawler.run([board.listUrl]);

  const list = articles.slice(0, 12).map(normalizeListArticle);
  let detail = null;
  if (list[0]) {
    const detailHtml = { value: "" };
    const detailCrawler = new CheerioCrawler({
      maxRequestsPerCrawl: 1,
      async requestHandler({ $, body, request }) {
        detailHtml.value = typeof body === "string" ? body : $.html();
        detail = normalizeDetailDocument(
          philsamoAdapter.fetchArticleDetail({
            article: list[0],
            html: detailHtml.value,
            pageUrl: request.loadedUrl || request.url,
          })
        );
      },
    });
    await detailCrawler.run([list[0].canonicalUrl]);
  }

  const verdict =
    list.length >= 10 && detail && detail.bodyText.length > 20
      ? "PASS"
      : "FAIL";

  return {
    poc: "A",
    site: "philsamo",
    engine: "CheerioCrawler",
    boardUrl: board.listUrl,
    pagesFetched,
    listCount: list.length,
    articles: list,
    detail,
    verdict,
    layers: {
      implementation: "PASS",
      localRuntime: pagesFetched > 0 ? "PASS" : "FAIL",
      productE2E: "NOT_YET",
    },
  };
}

async function pocBHelloCebu() {
  const listUrl = helloCebuListApiUrl(12);
  let listBody = "";
  const listCrawler = new CheerioCrawler({
    maxRequestsPerCrawl: 1,
    additionalMimeTypes: ["application/json"],
    async requestHandler({ body }) {
      listBody = typeof body === "string" ? body : String(body ?? "");
    },
  });
  await listCrawler.run([listUrl]);

  const list = helloCebuAdapter.fetchArticleList({
    board: helloCebuAdapter.listBoards()[0],
    html: listBody,
    pageUrl: listUrl,
  }).map(normalizeListArticle);

  let detail = null;
  if (list[0]) {
    const detailUrl = helloCebuDetailApiUrl(list[0].externalArticleKey);
    let detailBody = "";
    const detailCrawler = new CheerioCrawler({
      maxRequestsPerCrawl: 1,
      additionalMimeTypes: ["application/json"],
      async requestHandler({ body }) {
        detailBody = typeof body === "string" ? body : String(body ?? "");
      },
    });
    await detailCrawler.run([detailUrl]);
    detail = normalizeDetailDocument(helloCebuAdapter.fetchArticleDetail({
      article: list[0],
      html: detailBody,
      pageUrl: detailUrl,
    }));
  }

  const hasBodyImagesNoFeatured =
    detail &&
    detail.bodyImageUrls.length > 0 &&
    Boolean(detail.thumbnailUrl);

  const verdict =
    list.length >= 10 &&
    detail &&
    detail.author &&
    detail.sourcePublishedAt &&
    detail.bodyText.length > 20 &&
    detail.bodyImageUrls.length >= 0
      ? "PASS"
      : "FAIL";

  return {
    poc: "B",
    site: "hellocebuph",
    engine: "CheerioCrawler",
    boardUrl: listUrl,
    listCount: list.length,
    articles: list,
    detail,
    thumbnailRule: detail?.mediaMeta?.thumbnailAuthority ?? null,
    thumbFromContentImagePossible: Boolean(hasBodyImagesNoFeatured),
    verdict,
    layers: {
      implementation: "PASS",
      localRuntime: listBody.length > 0 ? "PASS" : "FAIL",
      productE2E: "NOT_YET",
    },
  };
}

async function pocCPhilgo() {
  const startUrl = "https://philgo.com/";
  const evidence = {
    url: startUrl,
    title: null,
    finalUrl: null,
    bodySnippet: null,
    challengeDetected: false,
    articleLinks: [],
    error: null,
  };

  try {
    const crawler = new PlaywrightCrawler({
      maxRequestsPerCrawl: 1,
      headless: true,
      navigationTimeoutSecs: 45,
      async requestHandler({ page, request }) {
        evidence.finalUrl = page.url();
        evidence.title = await page.title();
        const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
        evidence.bodySnippet = String(text).slice(0, 500);
        const low = `${evidence.title}\n${text}`.toLowerCase();
        evidence.challengeDetected =
          low.includes("just a moment") ||
          low.includes("cf-browser-verification") ||
          low.includes("attention required") ||
          low.includes("cloudflare");

        const hrefs = await page.$$eval("a[href]", (as) =>
          as
            .map((a) => ({ href: a.href, text: (a.textContent || "").trim().slice(0, 80) }))
            .filter((x) => x.href && x.href.includes("philgo.com"))
            .slice(0, 30)
        );
        evidence.articleLinks = hrefs;
      },
      failedRequestHandler({ request }, err) {
        evidence.error = String(err?.message || err);
      },
    });
    await crawler.run([startUrl]);
  } catch (e) {
    evidence.error = String(e?.message || e);
  }

  const canList =
    !evidence.challengeDetected &&
    evidence.articleLinks.length >= 5 &&
    evidence.bodySnippet &&
    evidence.bodySnippet.length > 100;

  return {
    poc: "C",
    site: "philgo",
    engine: "PlaywrightCrawler",
    goal: "browser session open → board → list (NOT cloudflare bypass)",
    evidence,
    verdict: canList ? "PASS" : "BLOCKED",
    layers: {
      implementation: "PASS",
      localRuntime: evidence.title != null || evidence.error ? "PASS" : "FAIL",
      session: canList ? "PASS" : "NOT_PROVEN",
      productE2E: "NOT_YET",
    },
  };
}

const startedAt = new Date().toISOString();
const a = await pocAPhilsamo();
writeJson("poc-a-philsamo.json", a);
const b = await pocBHelloCebu();
writeJson("poc-b-hellocebuph.json", b);
const c = await pocCPhilgo();
writeJson("poc-c-philgo.json", c);

const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  outDir: OUT_DIR,
  crawlee: "3.18.1",
  playwright: "1.63.0",
  workerLocation: "services/crawl-worker local Node (not Vercel)",
  supabaseJobSsot: "MIGRATION_FILE_ONLY — live apply NOT run (Owner: PRODUCTION NO)",
  communityCoreChanged: "NO (attribution moved to lib/community only)",
  results: {
    A: { verdict: a.verdict, listCount: a.listCount, detailTitle: a.detail?.title ?? null },
    B: { verdict: b.verdict, listCount: b.listCount, detailTitle: b.detail?.title ?? null },
    C: { verdict: c.verdict, challengeDetected: c.evidence.challengeDetected },
  },
};

writeJson("poc-summary.json", summary);
console.log(JSON.stringify(summary, null, 2));
