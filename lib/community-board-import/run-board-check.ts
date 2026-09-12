import { safeFetchHtml } from "@/lib/community-crawler/core/safe-fetch";
import {
  resolveBoardCheckStatus,
  type BoardCheckCapability,
  type BoardCheckReason,
  type BoardCheckResult,
  type BoardCheckSampleCard,
} from "@/lib/community-board-import/board-check";
import { findBoardDuplicateByUrl } from "@/lib/community-board-import/store";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleDocument } from "@/lib/community-board-import/article-document";

function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Minimal list-link discovery — fail-closed when empty. */
export function discoverArticleLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const abs = absolutize(m[1], baseUrl);
    if (!abs) continue;
    if (!/^https?:/i.test(abs)) continue;
    if (abs === baseUrl || abs.replace(/\/$/, "") === baseUrl.replace(/\/$/, "")) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
    if (out.length >= 40) break;
  }
  return out;
}

function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1].trim();
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (t?.[1] ?? "").replace(/\s+/g, " ").trim();
}

function extractParagraphs(html: string): string[] {
  const paras: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= 40) paras.push(text);
    if (paras.length >= 8) break;
  }
  return paras;
}

function extractImages(html: string, baseUrl: string): { src: string; alt: string }[] {
  const imgs: { src: string; alt: string }[] = [];
  const seen = new Set<string>();
  const re = /<img\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const srcM = tag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcM?.[1]) continue;
    const abs = absolutize(srcM[1], baseUrl);
    if (!abs || seen.has(abs)) continue;
    if (/\.svg(\?|$)/i.test(abs) || /sprite|icon|logo/i.test(abs)) continue;
    seen.add(abs);
    const altM = tag.match(/\balt=["']([^"']*)["']/i);
    imgs.push({ src: abs, alt: altM?.[1] ?? "" });
    if (imgs.length >= 12) break;
  }
  return imgs;
}

export function buildArticleDocumentFromHtml(input: {
  html: string;
  canonicalUrl: string;
}): ArticleDocument {
  const title = extractTitle(input.html) || input.canonicalUrl;
  const paragraphs = extractParagraphs(input.html);
  const images = extractImages(input.html, input.canonicalUrl);
  const nodes: ArticleDocument["nodes"] = [];
  const max = Math.max(paragraphs.length, images.length);
  for (let i = 0; i < max; i++) {
    if (i < paragraphs.length) nodes.push({ kind: "paragraph", text: paragraphs[i]! });
    if (i < images.length) {
      nodes.push({
        kind: "image",
        src: images[i]!.src,
        alt: images[i]!.alt,
        imageId: `img-${i}`,
      });
    }
  }
  if (nodes.length === 0 && title) {
    nodes.push({ kind: "paragraph", text: title });
  }
  return { title, nodes, canonicalUrl: input.canonicalUrl };
}

export async function runBoardCheck(input: {
  sb: SupabaseClient;
  sourceUrl: string;
}): Promise<BoardCheckResult> {
  const reasons: BoardCheckReason[] = [];
  const capability: BoardCheckCapability = {
    reachable: false,
    discoveredCount: 0,
    titleOk: false,
    bodyOk: false,
    imageOk: false,
    validImageCount: 0,
  };
  const samples: BoardCheckSampleCard[] = [];
  let finalUrl: string | null = null;

  try {
    const list = await safeFetchHtml(input.sourceUrl);
    finalUrl = list.finalUrl;
    capability.reachable = list.status >= 200 && list.status < 400;
    if (!capability.reachable) {
      reasons.push({
        code: "HTTP_ERROR",
        message: `게시판 응답 코드 ${list.status}`,
      });
    } else {
      const links = discoverArticleLinks(list.bodyText, list.finalUrl);
      capability.discoveredCount = links.length;
      let titleOk = 0;
      let bodyOk = 0;
      let imageOk = 0;
      for (const link of links.slice(0, 3)) {
        try {
          const detail = await safeFetchHtml(link);
          const doc = buildArticleDocumentFromHtml({
            html: detail.bodyText,
            canonicalUrl: detail.finalUrl,
          });
          const paras = doc.nodes.filter((n) => n.kind === "paragraph");
          const imgs = doc.nodes.filter((n) => n.kind === "image");
          if (doc.title.trim().length > 3) titleOk += 1;
          if (paras.length > 0) bodyOk += 1;
          if (imgs.length > 0) imageOk += 1;
          samples.push({
            thumbnailUrl: imgs[0]?.kind === "image" ? imgs[0].src : null,
            title: doc.title,
            bodyPreview: paras[0]?.kind === "paragraph" ? paras[0].text.slice(0, 150) : "",
            sourceAuthor: null,
            sourceDate: null,
          });
        } catch {
          /* sample fetch soft */
        }
      }
      capability.titleOk = titleOk > 0;
      capability.bodyOk = bodyOk > 0;
      capability.validImageCount = imageOk;
      capability.imageOk = imageOk > 0;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    if (/JavaScript|UNSUPPORTED_JS|challenge/i.test(msg)) {
      return {
        status: "UNSUPPORTED",
        capability,
        samples,
        reasons: [{ code: "UNSUPPORTED_JS", message: "JavaScript 렌더링이 필요하거나 접근이 차단되었습니다." }],
        registration: (await findBoardDuplicateByUrl(input.sb, input.sourceUrl, finalUrl)).result,
        communityPostsWrite: 0,
      };
    }
    capability.reachable = false;
    reasons.push({ code: "FETCH_FAILED", message: msg });
  }

  const resolved = resolveBoardCheckStatus(
    capability,
    reasons.find((r) => r.code === "HTTP_ERROR") ?? null
  );
  const registration = (await findBoardDuplicateByUrl(input.sb, input.sourceUrl, finalUrl)).result;

  return {
    status: resolved.status,
    capability,
    samples,
    reasons: resolved.reasons.length ? resolved.reasons : reasons,
    registration,
    communityPostsWrite: 0,
  };
}
