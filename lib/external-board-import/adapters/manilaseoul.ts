import * as cheerio from "cheerio";
import type { ExternalBoardAdapter, ExternalBoardAdapterContext } from "@/lib/external-board-import/adapters/types";
import { absolutizeUrl, fetchExternalBoardHtml } from "@/lib/external-board-import/extraction/fetch-html";
import {
  normalizeDiscoverOpts,
  withinDateRange,
  type ExternalBoardDiscoverOpts,
} from "@/lib/external-board-import/extraction/discover-opts";
import {
  buildDocumentFromHtml,
  extractMetaAuthor,
  extractOgTitle,
} from "@/lib/external-board-import/extraction/ordered-from-html";
import { parseExternalBoardSourceDate } from "@/lib/external-board-import/extraction/parse-source-date";
import type { ExternalBoardDiscoverItem } from "@/lib/external-board-import/types";
import {
  getManilaSeoulSection,
  resolveManilaSeoulTb,
} from "@/lib/external-board-import/adapters/manilaseoul-sections";

function listUrlForPage(sourceUrl: string, page: number): string {
  const u = new URL(sourceUrl);
  if (page <= 1) {
    u.searchParams.delete("pg");
  } else {
    u.searchParams.set("pg", String(page));
  }
  return u.toString();
}

function discoverListItems(html: string, baseUrl: string, tb: string): Array<{
  bbsNum: string;
  title: string;
  canonicalUrl: string;
}> {
  const $ = cheerio.load(html);
  const out: Array<{ bbsNum: string; title: string; canonicalUrl: string }> = [];
  const seen = new Set<string>();
  $('a[href*="bbs_detail.php"]').each((_, a) => {
    const href = String($(a).attr("href") || "");
    const abs = absolutizeUrl(baseUrl, href);
    if (!abs) return;
    let u: URL;
    try {
      u = new URL(abs);
    } catch {
      return;
    }
    if (u.searchParams.get("tb") !== tb) return;
    const bbsNum = u.searchParams.get("bbs_num");
    if (!bbsNum || seen.has(bbsNum)) return;
    const title = $(a).text().replace(/\s+/g, " ").trim();
    if (!title || title.length < 2) return;
    seen.add(bbsNum);
    const canonical = `http://manilaseoul.co.kr/bbs_detail.php?bbs_num=${bbsNum}&tb=${encodeURIComponent(tb)}`;
    out.push({ bbsNum, title, canonicalUrl: canonical });
  });
  return out;
}

async function fetchManilaSeoulDocument(item: ExternalBoardDiscoverItem): Promise<ExternalBoardDiscoverItem> {
  const fetched = await fetchExternalBoardHtml(item.canonicalUrl);
  if (!fetched.ok) {
    return { ...item, sampleDocument: null };
  }
  const $ = cheerio.load(fetched.html);
  const title =
    extractOgTitle(fetched.html)?.replace(/\s*-\s*필리핀 교민신문.*$/u, "").trim() ||
    item.title;
  const authorFromMeta = extractMetaAuthor(fetched.html);
  let author = authorFromMeta;
  const authorCell = $("td.detail_st_12")
    .filter((_, el) => $(el).text().includes("작성자"))
    .first()
    .next("td");
  const authorText = authorCell.find("a").first().text().replace(/\s+/g, " ").trim();
  if (authorText) author = authorText;
  const dateText = $("td.detail_st_11").first().text().replace(/\s+/g, " ").trim();
  const sourcePublishedAt = parseExternalBoardSourceDate(dateText);
  const doc = buildDocumentFromHtml({
    title,
    canonicalUrl: item.canonicalUrl,
    html: fetched.html,
    baseUrl: fetched.finalUrl,
    rootSelector: "#ct",
  });
  if (!doc.nodes.length) {
    const desc = $('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content");
    if (desc) doc.nodes.push({ type: "paragraph", text: String(desc).trim() });
    const ogImg = $('meta[property="og:image"]').attr("content");
    if (ogImg) {
      const abs = absolutizeUrl(fetched.finalUrl, ogImg);
      if (abs) doc.nodes.unshift({ type: "image", src: abs });
    }
  }
  return {
    ...item,
    title: doc.title || title,
    sourceAuthor: author || null,
    sourcePublishedAt,
    sampleDocument: doc.nodes.length ? doc : null,
  };
}

export const manilaSeoulExternalBoardAdapter: ExternalBoardAdapter = {
  id: "manilaseoul-static-bbs",
  matches: (ctx: ExternalBoardAdapterContext) => {
    const host = ctx.siteKey === "manilaseoul.co.kr" || ctx.sourceUrl.includes("manilaseoul.co.kr");
    if (!host) return false;
    const tb = resolveManilaSeoulTb(ctx.sourceUrl);
    if (!tb) return false;
    const section = getManilaSeoulSection(tb);
    // Adapter may still attempt needs_check sections. Disabled = never.
    // PRODUCT CATALOG eligibility is separate (source-catalog.ts).
    if (section) {
      if (section.capability === "disabled") return false;
      return Boolean(section.listUrl);
    }
    // Unknown tb on bbs_list — allow adapter attempt (needs_check), still requires explicit tb.
    return ctx.sourceUrl.includes("bbs_list.php");
  },
  async verifyBoard(ctx) {
    const tb = resolveManilaSeoulTb(ctx.sourceUrl);
    if (!tb) {
      return {
        status: "UNSUPPORTED",
        reasons: ["불러올 게시판을 선택하세요. (tb 미지정 — board_free 기본값 없음)"],
        samples: [],
      };
    }
    const section = getManilaSeoulSection(tb);
    if (section?.capability === "disabled") {
      return { status: "UNSUPPORTED", reasons: [`${section.label}은 수집 대상 게시판이 아닙니다.`], samples: [] };
    }
    const samples = await this.discoverArticles(ctx, { limit: 3, pageFrom: 1, pageTo: 1 });
    const withDocs = samples.filter((s) => s.sampleDocument && s.sampleDocument.nodes.length > 0);
    if (withDocs.length >= 3) return { status: "READY", reasons: ["manilaseoul_ready"], samples: withDocs };
    if (withDocs.length > 0) return { status: "PARTIAL", reasons: ["manilaseoul_partial"], samples: withDocs };
    return { status: "UNSUPPORTED", reasons: ["manilaseoul_no_samples"], samples: [] };
  },
  async discoverArticles(ctx, opts?: ExternalBoardDiscoverOpts) {
    const n = normalizeDiscoverOpts(opts);
    const tb = resolveManilaSeoulTb(ctx.sourceUrl);
    if (!tb) {
      throw Object.assign(new Error("불러올 게시판을 선택하세요."), {
        failureStage: "discover",
        failureCode: "source_section_required",
      });
    }
    const section = getManilaSeoulSection(tb);
    if (section?.capability === "disabled") {
      throw Object.assign(new Error(`${section.label}은 수집할 수 없습니다.`), {
        failureStage: "discover",
        failureCode: "source_section_disabled",
      });
    }
    const collected: ExternalBoardDiscoverItem[] = [];
    const seen = new Set<string>();
    for (let page = n.pageFrom; page <= n.pageTo && collected.length < n.limit; page += 1) {
      const listUrl = listUrlForPage(ctx.sourceUrl, page);
      const fetched = await fetchExternalBoardHtml(listUrl);
      if (!fetched.ok) break;
      const listItems = discoverListItems(fetched.html, fetched.finalUrl, tb);
      for (const li of listItems) {
        if (seen.has(li.bbsNum)) continue;
        seen.add(li.bbsNum);
        const base: ExternalBoardDiscoverItem = {
          stableArticleIdentity: `stable:ms-${tb}-${li.bbsNum}`,
          identityKind: "stable_id",
          canonicalUrl: li.canonicalUrl,
          title: li.title,
        };
        const full = await fetchManilaSeoulDocument(base);
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
    const full = await fetchManilaSeoulDocument(item);
    if (full.sampleDocument) return full.sampleDocument;
    throw Object.assign(new Error("manilaseoul_fetch_empty"), {
      failureStage: "fetch",
      failureCode: "empty_document",
    });
  },
};
