import { describe, expect, it } from "vitest";
import { classifyCrawlDetailPageHtml } from "@/lib/community-crawler/core/classify-detail-page";

function soft404Shell(pageProps: Record<string, unknown> = {}) {
  return `<!doctype html><html><body>
    <div>Woops! Page not found</div>
    <p>Sorry for the inconvenience. The page you are looking for either got moved or is no longer available.</p>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps },
      page: "/articles/[slug]",
      isFallback: true,
    })}</script>
  </body></html>`;
}

function validArticle() {
  return `<!doctype html><html><body>
    <article><p>${"Cebu has many attractions. ".repeat(8)}</p></article>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          data: {
            article: {
              title: "Cebu",
              content: "body",
            },
          },
        },
      },
    })}</script>
  </body></html>`;
}

describe("classifyCrawlDetailPageHtml SOURCE_INVALID", () => {
  it("marks empty pageProps + soft-404 shell as SOURCE_INVALID", () => {
    const r = classifyCrawlDetailPageHtml(soft404Shell({}));
    expect(r.kind).toBe("SOURCE_INVALID");
    if (r.kind === "SOURCE_INVALID") {
      expect(r.reason).toBe("empty_pageprops_soft_404_shell");
    }
  });

  it("marks soft-404 body without article as SOURCE_INVALID", () => {
    const html = `<html><body><p>Page not found</p><p>no longer available</p></body></html>`;
    const r = classifyCrawlDetailPageHtml(html);
    expect(r.kind).toBe("SOURCE_INVALID");
  });

  it("proceeds when article payload exists even if soft-404 phrase appears elsewhere", () => {
    const r = classifyCrawlDetailPageHtml(validArticle());
    expect(r).toEqual({ kind: "PROCEED" });
  });

  it("does not invent SOURCE_INVALID for normal short article shells without soft-404", () => {
    const html = `<html><body><h1>Hello</h1><p>short</p></body></html>`;
    expect(classifyCrawlDetailPageHtml(html)).toEqual({ kind: "PROCEED" });
  });
});
