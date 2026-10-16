/**
 * Korean blog platforms whose public pages need a known URL shape (pure; unit-tested).
 *  - Naver blog: `blog.naver.com/{id}` is a frameset; the public feed is `rss.blog.naver.com/{id}.xml`
 *    and the readable article page is the mobile one (`m.blog.naver.com/{id}/{logNo}`).
 *  - Brunch: article body lives in `.wrap_body`; its feed is linked from the author page.
 * Only public pages are read — no login, no private/neighbour-only posts.
 */

const NAVER_BLOG_HOST = /^(?:m\.)?blog\.naver\.com$/i;
const RESERVED_NAVER_PATHS = new Set(["PostView.naver", "PostView.nhn", "PostList.naver", "PostList.nhn", "prologue", "BlogHome.naver"]);

/** Naver blog id from a blog / post URL (`blog.naver.com/{id}[/{logNo}]` or `PostView.naver?blogId=`). */
export function naverBlogId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!NAVER_BLOG_HOST.test(u.hostname)) return null;
  const q = u.searchParams.get("blogId");
  if (q && /^[\w-]+$/.test(q)) return q;
  const first = u.pathname.split("/").filter(Boolean)[0];
  if (!first || RESERVED_NAVER_PATHS.has(first) || !/^[\w-]+$/.test(first)) return null;
  return first;
}

/** Public feed of a blog home URL on a known platform (null = not a known platform). */
export function knownFeedFor(url: string): string | null {
  const id = naverBlogId(url);
  return id ? `https://rss.blog.naver.com/${id}.xml` : null;
}

/** The page to fetch for an article body (the original URL stays the canonical/provenance URL). */
export function articleFetchUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!NAVER_BLOG_HOST.test(u.hostname)) return url;
  const id = naverBlogId(url);
  const logNo = u.searchParams.get("logNo") || u.pathname.split("/").filter(Boolean)[1] || "";
  return id && /^\d+$/.test(logNo) ? `https://m.blog.naver.com/${id}/${logNo}` : url;
}

/** Naver blog / Brunch body containers (tried before the generic list). */
export const PLATFORM_BODY_SELECTORS = [".se-main-container", "#postViewArea", ".post_ct", ".wrap_body"];

/** Naver serves blurred 80px placeholders (`?type=w80_blur`) until lazy-load; ask for the full width. */
export function fullSizePlatformImage(url: string): string {
  return /(?:pstatic\.net|blogfiles\.naver\.net)/i.test(url) ? url.replace(/([?&]type=)w\d+(?:_blur)?\b/i, "$1w966") : url;
}
