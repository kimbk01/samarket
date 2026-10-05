/**
 * SOURCE DETECTION + BOARD DISCOVERY (server side).
 * URL → robots → type → real boards → per-board sample (list + one detail) → verdict.
 * Access blocks are reported as BLOCKED and never bypassed.
 */
import * as cheerio from "cheerio";
import { adapterFor } from "./adapters";
import { type AdapterContext, boardUrl, type DiscoveredBoard, slugBoardId, sourceBase } from "./adapters/common";
import { discoverGnuboardBoards } from "./adapters/gnuboard";
import { discoverHtmlBoards, rankItemTemplates } from "./adapters/html";
import { discoverRssBoards, FEED_PATH_CANDIDATES, readFeed } from "./adapters/rss";
import { discoverWordpressBoards, probeWordpressApi } from "./adapters/wordpress";
import { describeFetchError, fetchImportText, ImportFetchError } from "./http";
import { absUrl, blockStats, cleanText } from "./normalize";
import { assessArticleQuality } from "./quality";
import { assertRobotsAllows, isPathAllowed, loadRobotsPolicy } from "./robots";
import type {
  AdapterConfig,
  BoardKind,
  OperatorListRow,
  OperatorNormalizedArticle,
  RuntimeBoard,
  RuntimeSource,
  SourceEngine,
} from "./types";

export type DetectVerdict = "FULL" | "PARTIAL" | "BLOCKED" | "FAILED" | "NOT_PROVEN";

export type BoardSample = {
  verdict: DetectVerdict;
  listCount: number;
  withThumb: number;
  latestAt: string | null;
  sampleTitle: string | null;
  sampleUrl: string | null;
  textChars: number;
  imageCount: number;
  reasons: string[];
};

export type DetectedBoard = DiscoveredBoard & {
  robotsAllowed: boolean;
  sample: BoardSample | null;
};

export type DetectResult = {
  inputUrl: string;
  baseUrl: string;
  sourceIdSuggestion: string;
  displayNameSuggestion: string;
  engine: SourceEngine | null;
  verdict: DetectVerdict;
  reason: string;
  robots: { status: string; aiBotsBlocked: boolean };
  adapterConfig: AdapterConfig;
  boards: DetectedBoard[];
  checkedAt: string;
  elapsedMs: number;
};

export function suggestSourceId(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean)[0];
    return slugBoardId(`${host}${path && !/\.(php|html?)$/.test(path) ? `_${path}` : ""}`).replace(/-/g, "_").slice(0, 48);
  } catch {
    return `source_${Date.now()}`;
  }
}

function result(partial: Partial<DetectResult> & Pick<DetectResult, "inputUrl" | "verdict" | "reason">, t0: number): DetectResult {
  return {
    baseUrl: partial.baseUrl ?? partial.inputUrl,
    sourceIdSuggestion: partial.sourceIdSuggestion ?? suggestSourceId(partial.inputUrl),
    displayNameSuggestion: partial.displayNameSuggestion ?? "",
    engine: partial.engine ?? null,
    robots: partial.robots ?? { status: "unknown", aiBotsBlocked: false },
    adapterConfig: partial.adapterConfig ?? {},
    boards: partial.boards ?? [],
    checkedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    ...partial,
  } as DetectResult;
}

async function findFeeds(base: string, $home: ReturnType<typeof cheerio.load>, homeUrl: string) {
  const feeds: Array<{ url: string; title: string | null }> = [];
  $home("link[rel='alternate']").each((_, l) => {
    const type = String($home(l).attr("type") || "");
    if (!/rss|atom/i.test(type)) return;
    const u = absUrl(homeUrl, $home(l).attr("href"));
    const title = cleanText($home(l).attr("title")) || null;
    if (u && !/comments/i.test(u) && !feeds.some((f) => f.url === u)) feeds.push({ url: u, title });
  });
  if (feeds.length) return feeds;
  for (const p of FEED_PATH_CANDIDATES) {
    const u = new URL(p, base).toString();
    try {
      const items = await readFeed(u);
      if (items.length) {
        feeds.push({ url: u, title: null });
        break;
      }
    } catch {
      /* try next */
    }
  }
  return feeds;
}

export async function detectSource(inputRaw: string, opts: { sampleBoards?: number; budgetMs?: number } = {}): Promise<DetectResult> {
  const t0 = Date.now();
  let input: URL;
  try {
    input = new URL(inputRaw.trim());
    if (!/^https?:$/.test(input.protocol)) throw new Error("protocol");
  } catch {
    return result({ inputUrl: inputRaw, verdict: "FAILED", reason: "잘못된 URL입니다 (http/https만 지원)." }, t0);
  }
  const inputUrl = input.toString();

  const robots = await loadRobotsPolicy(input.origin);
  const robotsInfo = { status: robots.status, aiBotsBlocked: robots.aiBotsBlocked };
  if (!isPathAllowed(robots.groups, input.pathname + input.search) || !isPathAllowed(robots.groups, "/")) {
    return result({ inputUrl, robots: robotsInfo, verdict: "BLOCKED", reason: "robots.txt가 이 경로의 수집을 금지합니다." }, t0);
  }

  let home;
  try {
    home = await fetchImportText(inputUrl);
  } catch (e) {
    const blocked = e instanceof ImportFetchError && (e.code === "challenge" || e.status === 401 || e.status === 403);
    return result(
      { inputUrl, robots: robotsInfo, verdict: blocked ? "BLOCKED" : "FAILED", reason: `사이트 접근 실패: ${describeFetchError(e)}` },
      t0,
    );
  }
  const $home = cheerio.load(home.text);
  const html = home.text;
  const finalUrl = home.finalUrl;
  const siteName =
    cleanText($home('meta[property="og:site_name"]').attr("content")) || cleanText($home("title").text()).slice(0, 60);

  // Base: gnuboard sites may live in a sub-directory (…/madang/bbs/…).
  let base = new URL("./", finalUrl).toString();
  const bbsHref = $home("a[href*='bbs/board.php']").first().attr("href");
  if (bbsHref) {
    const abs = absUrl(finalUrl, bbsHref);
    if (abs) base = abs.replace(/bbs\/board\.php.*$/, "");
  } else if (/\/bbs\//.test(finalUrl)) {
    base = finalUrl.replace(/bbs\/.*$/, "");
  } else {
    base = `${new URL(finalUrl).origin}/`;
  }

  const draftSource = (engine: SourceEngine, adapterConfig: AdapterConfig = {}): RuntimeSource => ({
    id: suggestSourceId(base),
    displayName: siteName,
    baseUrl: base,
    engine,
    enabled: true,
    contentPolicy: "summary_link",
    adapterConfig,
    verification: "NOT_PROVEN",
  });

  let engine: SourceEngine;
  let boards: DiscoveredBoard[] = [];
  let adapterConfig: AdapterConfig = {};
  const isTistory = /tistory\.com|tistory_|daumcdn|kakaocdn/i.test(html.slice(0, 300000)) && /\/(entry|category)\//.test(html);

  if (bbsHref || /bo_table=/.test(finalUrl)) {
    engine = "gnuboard";
    boards = await discoverGnuboardBoards({ source: draftSource(engine) }, html);
  } else if (!isTistory && /wp-content|wp-json|wp-includes/i.test(html) && (await probeWordpressApi({ source: draftSource("wordpress_rest") }))) {
    engine = "wordpress_rest";
    boards = await discoverWordpressBoards({ source: draftSource(engine) });
  } else {
    // A specific list page (section/category URL) keeps the admin's choice: collect that list as HTML
    // instead of switching to a site-wide feed that would ignore the section.
    const entered = new URL(finalUrl);
    const isSectionPage = (entered.pathname !== "/" && entered.pathname !== new URL(base).pathname) || entered.search.length > 1;
    const inputTemplate = !isTistory && isSectionPage ? rankItemTemplates(html, finalUrl)[0] : undefined;
    const feeds = inputTemplate && inputTemplate.items >= 5 ? [] : await findFeeds(base, $home, finalUrl);
    if (inputTemplate && inputTemplate.items >= 5) {
      engine = "html";
      adapterConfig = { itemUrlTemplate: inputTemplate.template };
      boards = [{ boardId: slugBoardId(entered.pathname + entered.search), displayName: siteName ? `${siteName} (입력한 목록)` : "입력한 목록", engineKey: finalUrl, boardKind: "editorial" }];
    } else if (feeds.length) {
      engine = "rss_atom";
      boards = await discoverRssBoards({ source: draftSource(engine) }, feeds);
    } else {
      engine = "html";
      boards = await discoverHtmlBoards({ source: draftSource(engine) }, html, finalUrl);
      const top = rankItemTemplates(html, finalUrl)[0];
      if (top) adapterConfig = { itemUrlTemplate: top.template };
    }
  }

  if (!boards.length) {
    return result(
      {
        inputUrl,
        baseUrl: base,
        engine,
        robots: robotsInfo,
        displayNameSuggestion: siteName,
        verdict: "FAILED",
        reason: "게시판·카테고리·피드를 찾지 못했습니다. 게시판 목록 URL을 직접 입력해 보세요.",
      },
      t0,
    );
  }

  const ctx: AdapterContext = { source: draftSource(engine, adapterConfig) };
  const budget = opts.budgetMs ?? 45_000;
  const maxSamples = opts.sampleBoards ?? 6;
  const order: Record<BoardKind, number> = { editorial: 0, community: 1, unknown: 2, directory: 3, member_qa: 4, ads: 5 };
  const sampleSet = new Set(
    [...boards].sort((a, b) => order[a.boardKind] - order[b.boardKind]).slice(0, maxSamples).map((b) => b.boardId),
  );

  const detected: DetectedBoard[] = [];
  for (const b of boards) {
    const runtimeBoard: RuntimeBoard = {
      sourceId: ctx.source.id,
      boardId: b.boardId,
      displayName: b.displayName,
      shortLabel: b.displayName.slice(0, 12),
      category: "living",
      engineKey: b.engineKey,
      enabled: true,
      collectEnabled: false,
      boardKind: b.boardKind,
      defaultTopicId: null,
    };
    let robotsAllowed = true;
    try {
      const listUrl =
        engine === "gnuboard"
          ? new URL(`bbs/board.php?bo_table=${encodeURIComponent(b.engineKey)}`, sourceBase(ctx.source))
          : new URL(/^https?:/.test(b.engineKey) ? b.engineKey : base);
      robotsAllowed = isPathAllowed(robots.groups, listUrl.pathname + listUrl.search);
    } catch {
      /* keep allowed */
    }
    let sample: BoardSample | null = null;
    if (sampleSet.has(b.boardId) && robotsAllowed && Date.now() - t0 < budget) {
      sample = await sampleBoard(ctx, runtimeBoard);
    } else if (!robotsAllowed) {
      sample = { verdict: "BLOCKED", listCount: 0, withThumb: 0, latestAt: null, sampleTitle: null, sampleUrl: null, textChars: 0, imageCount: 0, reasons: ["robots_disallowed"] };
    }
    detected.push({ ...b, robotsAllowed, sample });
  }

  const sampled = detected.filter((d) => d.sample);
  const verdict: DetectVerdict = sampled.some((d) => d.sample?.verdict === "FULL")
    ? "FULL"
    : sampled.some((d) => d.sample?.verdict === "PARTIAL")
      ? "PARTIAL"
      : sampled.length
        ? sampled.every((d) => d.sample?.verdict === "BLOCKED")
          ? "BLOCKED"
          : "FAILED"
        : "NOT_PROVEN";

  const reasonByVerdict: Record<DetectVerdict, string> = {
    FULL: "목록·본문·이미지 수집이 실제 샘플로 확인되었습니다.",
    PARTIAL: "수집은 되지만 일부 항목이 불완전합니다. 게시판별 사유를 확인하세요.",
    BLOCKED: "접근 또는 정책상 수집할 수 없습니다.",
    FAILED: "샘플 수집에 실패했습니다.",
    NOT_PROVEN: "시간 제한으로 샘플을 검증하지 못했습니다. 다시 검사하세요.",
  };

  return result(
    {
      inputUrl,
      baseUrl: base,
      engine,
      robots: robotsInfo,
      displayNameSuggestion: siteName,
      adapterConfig,
      boards: detected,
      verdict,
      reason: reasonByVerdict[verdict],
    },
    t0,
  );
}

export async function sampleBoard(ctx: AdapterContext, board: RuntimeBoard): Promise<BoardSample> {
  const adapter = adapterFor(ctx.source.engine);
  try {
    const rows = await adapter.list(ctx, board, 1);
    if (!rows.length) {
      return { verdict: "FAILED", listCount: 0, withThumb: 0, latestAt: null, sampleTitle: null, sampleUrl: null, textChars: 0, imageCount: 0, reasons: ["list_empty"] };
    }
    const dates = rows.map((r) => Date.parse(String(r.sourcePublishedDate || ""))).filter((n) => !Number.isNaN(n));
    const latestAt = dates.length ? new Date(Math.max(...dates)).toISOString() : null;
    const first = rows[0]!;
    try {
      const article = await adapter.detail(ctx, board, {
        articleKey: first.articleKey,
        detailUrl: first.detailUrl,
        title: first.title,
        summary: first.summary ?? null,
      });
      const q = assessArticleQuality(article);
      const st = blockStats(article.orderedContentBlocks);
      return {
        verdict: q.verdict,
        listCount: rows.length,
        withThumb: rows.filter((r) => r.thumbnailUrl).length,
        latestAt: latestAt ?? (article.sourcePublishedDate || null),
        sampleTitle: article.title || first.title,
        sampleUrl: article.canonicalUrl,
        textChars: st.textChars,
        imageCount: st.imageCount,
        reasons: q.reasons,
      };
    } catch (e) {
      return {
        verdict: e instanceof ImportFetchError && e.code === "challenge" ? "BLOCKED" : "PARTIAL",
        listCount: rows.length,
        withThumb: rows.filter((r) => r.thumbnailUrl).length,
        latestAt,
        sampleTitle: first.title,
        sampleUrl: first.detailUrl,
        textChars: 0,
        imageCount: 0,
        reasons: [`detail_failed: ${describeFetchError(e)}`],
      };
    }
  } catch (e) {
    const blocked = e instanceof ImportFetchError && (e.code === "challenge" || e.status === 403);
    return {
      verdict: blocked ? "BLOCKED" : "FAILED",
      listCount: 0,
      withThumb: 0,
      latestAt: null,
      sampleTitle: null,
      sampleUrl: null,
      textChars: 0,
      imageCount: 0,
      reasons: [`list_failed: ${describeFetchError(e)}`],
    };
  }
}

export type BoardProbe = {
  rows: OperatorListRow[];
  article: OperatorNormalizedArticle | null;
  quality: { verdict: string; reasons: string[] } | null;
  listError: string | null;
  detailError: string | null;
};

/**
 * Read-only probe of one board (nothing is stored): the real list plus the full extraction of one
 * article, so the operator can compare it with the original before registering.
 */
export async function probeBoard(input: {
  baseUrl: string;
  engine: SourceEngine;
  adapterConfig?: AdapterConfig;
  engineKey: string;
  displayName?: string;
  articleIndex?: number;
}): Promise<BoardProbe> {
  const source: RuntimeSource = {
    id: suggestSourceId(input.baseUrl),
    displayName: input.displayName || input.baseUrl,
    baseUrl: input.baseUrl,
    engine: input.engine,
    enabled: true,
    contentPolicy: "summary_link",
    adapterConfig: input.adapterConfig ?? {},
    verification: "NOT_PROVEN",
  };
  const board: RuntimeBoard = {
    sourceId: source.id,
    boardId: slugBoardId(input.engineKey),
    displayName: input.displayName || input.engineKey,
    shortLabel: (input.displayName || input.engineKey).slice(0, 12),
    category: "living",
    engineKey: input.engineKey,
    enabled: true,
    collectEnabled: false,
    boardKind: "unknown",
    defaultTopicId: null,
  };
  const adapter = adapterFor(source.engine);
  const out: BoardProbe = { rows: [], article: null, quality: null, listError: null, detailError: null };
  try {
    await assertRobotsAllows(boardUrl(source, board));
    out.rows = (await adapter.list({ source }, board, 1)).slice(0, 20);
  } catch (e) {
    out.listError = describeFetchError(e);
    return out;
  }
  const row = out.rows[Math.max(0, Math.min(out.rows.length - 1, input.articleIndex ?? 0))];
  if (!row) return out;
  try {
    await assertRobotsAllows(row.detailUrl);
    const article = await adapter.detail({ source }, board, {
      articleKey: row.articleKey,
      detailUrl: row.detailUrl,
      title: row.title,
      summary: row.summary ?? null,
    });
    out.article = article;
    out.quality = assessArticleQuality(article);
  } catch (e) {
    out.detailError = describeFetchError(e);
  }
  return out;
}
