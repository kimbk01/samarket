import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
import {
  extractArticlesFromListPage,
  extractArticleDetailFromHtml,
} from "@/lib/community-crawler/core/generic-article-extractor";
import { CommunityCrawlError } from "@/lib/community-crawler/core/errors";

export type BoardDiagnosticStatus = "READY" | "PARTIAL" | "UNSUPPORTED" | "UNSUPPORTED_JS";

export type SampleArticleCard = {
  title: string;
  snippet: string;
  coverUrl: string | null;
  author: string | null;
  date: string | null;
  detailUrl: string;
};

export type BoardDiagnosticResult = {
  status: BoardDiagnosticStatus;
  reason: string;
  sampleArticles: SampleArticleCard[];
  detectedArticlesCount: number;
  finalListUrl: string;
};

export async function runBoardDiagnostic(
  input: string | {
    listUrl: string;
    mediaRequired?: boolean;
  }
): Promise<BoardDiagnosticResult> {
  const listUrl = typeof input === "string" ? input : input.listUrl;
  const mediaRequired = typeof input === "string" ? true : (input.mediaRequired ?? true);

  // 1. Fetch List HTML
  let listFetch;
  try {
    listFetch = await safeFetchHtml(listUrl, { timeoutMs: 12_000 });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      status: "UNSUPPORTED",
      reason: `게시판 목록 접속 실패: ${err}`,
      sampleArticles: [],
      detectedArticlesCount: 0,
      finalListUrl: listUrl,
    };
  }

  // 2. Discover Articles
  let discovery;
  try {
    discovery = extractArticlesFromListPage(listFetch.bodyText, listFetch.finalUrl);
  } catch (e) {
    if (e instanceof CommunityCrawlError && e.code === "UNSUPPORTED_JS") {
      return {
        status: "UNSUPPORTED_JS",
        reason: "서버 렌더링 HTML에 게시글 목록이 없는 JS 렌더링 소스입니다.",
        sampleArticles: [],
        detectedArticlesCount: 0,
        finalListUrl: listFetch.finalUrl,
      };
    }
    const err = e instanceof Error ? e.message : String(e);
    return {
      status: "UNSUPPORTED",
      reason: `게시글 목록 추출 실패: ${err}`,
      sampleArticles: [],
      detectedArticlesCount: 0,
      finalListUrl: listFetch.finalUrl,
    };
  }

  const { items } = discovery;
  if (!items || items.length === 0) {
    return {
      status: "UNSUPPORTED",
      reason: "게시판 목록에서 유효한 게시글 링크를 찾지 못했습니다.",
      sampleArticles: [],
      detectedArticlesCount: 0,
      finalListUrl: listFetch.finalUrl,
    };
  }

  // 3. Sample up to 3 detail pages
  const candidatesToSample = items.slice(0, 3);
  const sampleArticles: SampleArticleCard[] = [];
  let imageCount = 0;
  let jsShellCount = 0;

  for (const item of candidatesToSample) {
    try {
      const detailFetch = await safeFetchHtml(item.detailUrl, { timeoutMs: 10_000 });
      const parsed = extractArticleDetailFromHtml(detailFetch.bodyText, detailFetch.finalUrl);

      if (parsed.title && parsed.contentMarkdown && parsed.contentMarkdown.trim().length >= 20) {
        if (parsed.representativeImageUrl) imageCount += 1;
        sampleArticles.push({
          title: parsed.title,
          snippet: parsed.contentMarkdown.slice(0, 150).replace(/[#*`_\[\]]/g, "").trim(),
          coverUrl: parsed.representativeImageUrl,
          author: parsed.author,
          date: parsed.dateRaw,
          detailUrl: item.detailUrl,
        });
      }
    } catch (e) {
      if (e instanceof CommunityCrawlError && e.code === "UNSUPPORTED_JS") {
        jsShellCount += 1;
      }
      // Continue sampling remaining candidates
    }
  }

  if (sampleArticles.length === 0) {
    if (jsShellCount > 0) {
      return {
        status: "UNSUPPORTED_JS",
        reason: "상세 페이지가 서버 렌더링 본문이 없는 클라이언트 JS 렌더링(SPA) 형태입니다.",
        sampleArticles: [],
        detectedArticlesCount: items.length,
        finalListUrl: listFetch.finalUrl,
      };
    }
    return {
      status: "UNSUPPORTED",
      reason: "게시글 상세 페이지에서 본문을 추출하지 못했습니다.",
      sampleArticles: [],
      detectedArticlesCount: items.length,
      finalListUrl: listFetch.finalUrl,
    };
  }

  // 4. Status determination
  if (mediaRequired && imageCount === 0) {
    return {
      status: "PARTIAL",
      reason: "본문은 정상 추출되나 대표 이미지를 찾지 못했습니다. (미디어 필수 해제 시 수집 가능)",
      sampleArticles,
      detectedArticlesCount: items.length,
      finalListUrl: listFetch.finalUrl,
    };
  }

  return {
    status: "READY",
    reason: `게시글 ${items.length}건 감지 완료. 즉시 수집 가능합니다.`,
    sampleArticles,
    detectedArticlesCount: items.length,
    finalListUrl: listFetch.finalUrl,
  };
}
