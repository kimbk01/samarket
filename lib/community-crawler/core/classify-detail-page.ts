/**
 * Classify detail HTML as SOURCE_INVALID (skip) vs proceed-to-parse.
 * Site-agnostic soft-404 / empty Next pageProps patterns — no URL allowlists.
 */

export type DetailPageClassification =
  | { kind: "SOURCE_INVALID"; reason: string }
  | { kind: "PROCEED" };

const SOFT_404_RE =
  /woops!\s*page not found|page not found|no longer available|sorry for the inconvenience\.?\s*the page you are looking for/i;

function extractNextData(html: string): unknown | null {
  const m = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function pagePropsOf(nextData: unknown): Record<string, unknown> | null {
  const props = (nextData as { props?: { pageProps?: unknown } } | null)?.props?.pageProps;
  if (!props || typeof props !== "object" || Array.isArray(props)) return null;
  return props as Record<string, unknown>;
}

function hasArticlePayload(pageProps: Record<string, unknown>): boolean {
  const data = pageProps.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const article = (data as { article?: unknown }).article;
    if (article && typeof article === "object") return true;
  }
  if (pageProps.article && typeof pageProps.article === "object") return true;
  return false;
}

function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SOURCE_INVALID when the detail response is a soft-404 / empty shell with no article payload.
 * HTTP status may still be 200.
 */
export function classifyCrawlDetailPageHtml(html: string): DetailPageClassification {
  const text = typeof html === "string" ? html : "";
  if (!text.trim()) {
    return { kind: "SOURCE_INVALID", reason: "empty_html" };
  }

  const nextData = extractNextData(text);
  const pageProps = nextData ? pagePropsOf(nextData) : null;
  const pagePropsEmpty = pageProps != null && Object.keys(pageProps).length === 0;
  const articlePayload = pageProps ? hasArticlePayload(pageProps) : false;
  const bodyText = stripScripts(text);
  const soft404 = SOFT_404_RE.test(bodyText);

  if (articlePayload) return { kind: "PROCEED" };

  // Proven Travel PH pattern: empty pageProps + soft-404 chrome, no article.
  if (pagePropsEmpty && soft404) {
    return {
      kind: "SOURCE_INVALID",
      reason: "empty_pageprops_soft_404_shell",
    };
  }

  // Soft-404 body without recoverable article payload (even if pageProps missing entirely).
  if (soft404 && !articlePayload) {
    return {
      kind: "SOURCE_INVALID",
      reason: "soft_404_shell_no_article",
    };
  }

  return { kind: "PROCEED" };
}
