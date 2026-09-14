/**
 * Deep public verify for operator source registration.
 * No Cloudflare/CAPTCHA/login bypass. No CSS/DOM selector capture from Admin.
 */
import * as cheerio from "cheerio";

export type VerifyEngine = "gnuboard" | "wordpress_rest" | "rss_atom" | "unknown";
export type VerifyVerdict = "VERIFIED" | "PARTIAL" | "BLOCKED" | "NOT_PROVEN" | "REJECT";

export type ProposedBoard = {
  boardId: string;
  displayName: string;
  shortLabel: string;
  category: string;
  engineKey: string;
};

export type SourceVerifyResult = {
  url: string;
  engine: VerifyEngine;
  verdict: VerifyVerdict;
  reason: string;
  probes: Array<{ path: string; status: number | null; note: string }>;
  fields: {
    list: boolean;
    detail: boolean;
    title: boolean;
    author: boolean;
    date: boolean;
    body: boolean;
    image: boolean;
    pagination: boolean;
    canonicalUrl: boolean;
  };
  sample: {
    articleKey: string | null;
    title: string | null;
    author: string | null;
    date: string | null;
    canonicalUrl: string | null;
    bodyChars: number;
    imageCount: number;
  } | null;
  proposedBoards: ProposedBoard[];
};

async function hit(
  url: string,
  note: string,
  probes: SourceVerifyResult["probes"],
): Promise<{ status: number; body: string; contentType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "DIBAY-OperatorImport/1.0 (+source-verify)",
        Accept: "*/*",
      },
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    });
    const body = await res.text();
    probes.push({
      path: url,
      status: res.status,
      note: `${note}; ct=${res.headers.get("content-type") || ""}; bytes=${body.length}`,
    });
    return { status: res.status, body, contentType: res.headers.get("content-type") || "" };
  } catch (e) {
    probes.push({
      path: url,
      status: null,
      note: `${note}; error=${e instanceof Error ? e.message : String(e)}`,
    });
    return null;
  }
}

function decodeHtml(raw: string): string {
  return cheerio.load(`<div id="d">${raw}</div>`)("#d").text().replace(/\s+/g, " ").trim();
}

function countImages(html: string): number {
  const $ = cheerio.load(html || "");
  return $("img").length;
}

function bodyTextLen(html: string): number {
  const $ = cheerio.load(html || "");
  $("script, style, noscript, iframe").remove();
  return $.text().replace(/\s+/g, " ").trim().length;
}

export async function verifyOperatorSourceUrl(rawUrl: string): Promise<SourceVerifyResult> {
  const probes: SourceVerifyResult["probes"] = [];
  let base: URL;
  try {
    base = new URL(rawUrl);
  } catch {
    return {
      url: rawUrl,
      engine: "unknown",
      verdict: "REJECT",
      reason: "invalid URL",
      probes,
      fields: {
        list: false,
        detail: false,
        title: false,
        author: false,
        date: false,
        body: false,
        image: false,
        pagination: false,
        canonicalUrl: false,
      },
      sample: null,
      proposedBoards: [],
    };
  }
  if (!/^https?:$/i.test(base.protocol)) {
    return {
      url: rawUrl,
      engine: "unknown",
      verdict: "REJECT",
      reason: "http/https only",
      probes,
      fields: {
        list: false,
        detail: false,
        title: false,
        author: false,
        date: false,
        body: false,
        image: false,
        pagination: false,
        canonicalUrl: false,
      },
      sample: null,
      proposedBoards: [],
    };
  }

  const origin = `${base.protocol}//${base.host}`;
  const home = await hit(origin + "/", "home", probes);
  const wpList = await hit(`${origin}/wp-json/wp/v2/posts?per_page=2&_embed=1`, "wp_list", probes);
  const feed = await hit(`${origin}/feed/`, "rss_feed", probes);
  const gnuboard = await hit(`${origin}/bbs/board.php`, "gnuboard_hint", probes);

  const fields = {
    list: false,
    detail: false,
    title: false,
    author: false,
    date: false,
    body: false,
    image: false,
    pagination: false,
    canonicalUrl: false,
  };
  let engine: VerifyEngine = "unknown";
  let verdict: VerifyVerdict = "NOT_PROVEN";
  let reason = "insufficient public signals";
  let sample: SourceVerifyResult["sample"] = null;
  const proposedBoards: ProposedBoard[] = [];

  const all403 = probes.length > 0 && probes.every((p) => p.status === 403);
  if (all403) {
    return {
      url: origin,
      engine: "unknown",
      verdict: "BLOCKED",
      reason: "HTTP 403 on probed public paths — no bypass",
      probes,
      fields,
      sample: null,
      proposedBoards: [],
    };
  }

  // WordPress REST deep proof
  if (wpList && wpList.status === 200) {
    try {
      const posts = JSON.parse(wpList.body);
      if (Array.isArray(posts) && posts.length > 0) {
        engine = "wordpress_rest";
        fields.list = true;
        fields.pagination = true;
        const p0 = posts[0];
        const id = String(p0.id);
        const detail = await hit(`${origin}/wp-json/wp/v2/posts/${id}?_embed=1`, "wp_detail", probes);
        if (detail && detail.status === 200) {
          const post = JSON.parse(detail.body);
          fields.detail = true;
          const title = decodeHtml(String(post?.title?.rendered || ""));
          const author = post?._embedded?.author?.[0]?.name || null;
          const date = post?.date || null;
          const html = String(post?.content?.rendered || "");
          const imgs = countImages(html);
          const bodyLen = bodyTextLen(html);
          fields.title = Boolean(title);
          fields.author = Boolean(author);
          fields.date = Boolean(date);
          fields.body = bodyLen > 40;
          fields.image = imgs > 0;
          fields.canonicalUrl = Boolean(post?.link);
          sample = {
            articleKey: id,
            title,
            author,
            date,
            canonicalUrl: post?.link || null,
            bodyChars: bodyLen,
            imageCount: imgs,
          };
        }
        const catsHit = await hit(`${origin}/wp-json/wp/v2/categories?per_page=20`, "wp_cats", probes);
        if (catsHit && catsHit.status === 200) {
          try {
            const cats = JSON.parse(catsHit.body);
            if (Array.isArray(cats)) {
              for (const c of cats) {
                if (!c?.count || !c?.slug) continue;
                if (String(c.slug).toLowerCase() === "uncategorized" && Number(c.count) < 5) continue;
                proposedBoards.push({
                  boardId: String(c.slug),
                  displayName: decodeHtml(String(c.name || c.slug)),
                  shortLabel: String(c.slug).slice(0, 12),
                  category: "living",
                  engineKey: String(c.id),
                });
                if (proposedBoards.length >= 8) break;
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (!proposedBoards.length) {
          proposedBoards.push({
            boardId: "latest",
            displayName: "Latest",
            shortLabel: "최신",
            category: "living",
            engineKey: "all",
          });
        }
        if (fields.list && fields.detail && fields.title && fields.body && fields.canonicalUrl) {
          verdict = "VERIFIED";
          reason = "WordPress REST list+detail fields proven";
        } else if (fields.list) {
          verdict = "PARTIAL";
          reason = "WordPress list OK but detail/body incomplete";
        }
      }
    } catch {
      /* fall through */
    }
  }

  // RSS deep proof if WP not verified
  if (verdict !== "VERIFIED" && feed && feed.status === 200 && /<rss|<feed/i.test(feed.body)) {
    engine = "rss_atom";
    const $ = cheerio.load(feed.body, { xmlMode: true });
    const items = $("item").toArray();
    const entries = items.length ? items : $("entry").toArray();
    if (entries.length) {
      fields.list = true;
      fields.pagination = entries.length > 1;
      const el = cheerio.load(entries[0], { xmlMode: true });
      // cheerio on element - use $()
      const $item = $(entries[0]);
      const title = decodeHtml($item.find("title").first().text() || "");
      const link = String($item.find("link").first().text() || $item.find("link").attr("href") || "").trim();
      const author =
        decodeHtml($item.find("dc\\:creator").first().text() || $item.find("author name").first().text() || "") || null;
      const date = String($item.find("pubDate").first().text() || $item.find("updated").first().text() || "").trim() || null;
      const encoded = $item.find("content\\:encoded").first().html() || $item.find("content").first().html() || $item.find("description").first().html() || "";
      fields.title = Boolean(title);
      fields.author = Boolean(author);
      fields.date = Boolean(date);
      fields.canonicalUrl = Boolean(link);
      let bodyLen = bodyTextLen(encoded);
      let imgs = countImages(encoded);
      fields.body = bodyLen > 40;
      fields.image = imgs > 0;
      fields.detail = fields.body || Boolean(link);
      if (link && bodyLen < 40) {
        const page = await hit(link, "rss_detail_html", probes);
        if (page && page.status === 200) {
          const $p = cheerio.load(page.body);
          $p("script, style, noscript, iframe, nav, footer, header, aside").remove();
          const root = $p("article").first().length
            ? $p("article").first()
            : $p(".entry-content, .article__content, .post-content, main").first();
          const html = root.length ? root.html() || "" : "";
          bodyLen = bodyTextLen(html);
          imgs = countImages(html);
          fields.body = bodyLen > 40;
          fields.image = imgs > 0;
          fields.detail = fields.body;
        }
      }
      sample = {
        articleKey: link ? link.slice(-24) : null,
        title,
        author,
        date,
        canonicalUrl: link || null,
        bodyChars: bodyLen,
        imageCount: imgs,
      };
      proposedBoards.push({
        boardId: "feed",
        displayName: "RSS Feed",
        shortLabel: "피드",
        category: "news",
        engineKey: "/feed/",
      });
      if (fields.list && fields.detail && fields.title && fields.body && fields.canonicalUrl) {
        verdict = "VERIFIED";
        reason = "RSS list + detail body proven";
      } else if (fields.list && fields.title) {
        verdict = "PARTIAL";
        reason = "RSS list OK; detail/body incomplete";
      }
    }
  }

  // Gnuboard hint only — custom boards need known bo_table; stay PARTIAL
  if (
    verdict === "NOT_PROVEN" &&
    gnuboard &&
    gnuboard.status === 200 &&
    /bo_table|그누보드|gnuboard/i.test(gnuboard.body + (home?.body || ""))
  ) {
    engine = "gnuboard";
    verdict = "PARTIAL";
    reason = "Gnuboard-like surface detected; explicit board list/detail not auto-proven for arbitrary sites";
  } else if (verdict === "NOT_PROVEN" && home && home.status === 200) {
    verdict = "PARTIAL";
    reason = "Home reachable; no WP/RSS list+detail proven";
  }

  return {
    url: origin,
    engine,
    verdict,
    reason,
    probes,
    fields,
    sample,
    proposedBoards,
  };
}

export function slugFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase()
      .slice(0, 48);
  } catch {
    return `source_${Date.now()}`;
  }
}

export function canEnableVerification(v: VerifyVerdict): boolean {
  return v === "VERIFIED" || v === "PARTIAL";
}
