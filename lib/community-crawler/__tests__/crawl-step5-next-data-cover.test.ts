import { describe, expect, it } from "vitest";
import {
  extractTravelPhCoverUrl,
  parseTravelPhilippinesDetailPage,
  TRAVEL_PH_NEXT_DATA_COVER_PATH,
} from "@/lib/community-crawler/adapters/travel-philippines";
import { parseDetailPage } from "@/lib/community-crawler/adapters/generic-html";

const COVER =
  "https://www.datocms-assets.com/31284/1617592887-bojo-river-aloguinsan-cebudji0287-2.jpg?h=720";

function fixtureHtml() {
  return `<!doctype html><html><body>
    <h1>Fallback</h1>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          data: {
            article: {
              title: "Cebu Province Tourist Activities",
              content: "<p>Hello travel body paragraph for tests about Cebu province activities.</p>",
              coverImage: { __typename: "FileField", url: COVER },
            },
          },
        },
      },
    })}</script>
  </body></html>`;
}

describe("Travel Philippines adapter (CUT B)", () => {
  it("reads proven cover path", () => {
    expect(TRAVEL_PH_NEXT_DATA_COVER_PATH).toBe("props.pageProps.data.article.coverImage.url");
    expect(extractTravelPhCoverUrl(fixtureHtml())).toBe(COVER);
  });

  it("parses title body cover from __NEXT_DATA__", () => {
    const detail = parseTravelPhilippinesDetailPage(
      fixtureHtml(),
      "https://app.philippines.travel/articles/cebu-province-tourist-activities"
    );
    expect(detail.title).toBe("Cebu Province Tourist Activities");
    expect(detail.representativeImageUrl).toBe(COVER);
    expect(detail.contentMarkdown.length).toBeGreaterThan(20);
  });

  it("generic-html does not use __NEXT_DATA__ fallback", () => {
    expect(() =>
      parseDetailPage(fixtureHtml(), "https://example.com/a", {
        detailLinkSelector: "a",
        titleSelector: "h2.missing",
        contentSelector: "div.missing",
      })
    ).toThrow();
  });
});
