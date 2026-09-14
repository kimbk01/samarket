import { describe, expect, it } from "vitest";
import { resolveExternalBoardAdapter } from "@/lib/external-board-import/adapters/registry";
import { externalBoardDocumentToCommunityContent } from "@/lib/external-board-import/document/to-community-content";

/** Network/live host proof — run explicitly: EXTERNAL_BOARD_LIVE_VERIFY=1 */
const LIVE = process.env.EXTERNAL_BOARD_LIVE_VERIFY === "1";

describe.skipIf(!LIVE)("DOT featured_media feed thumbnail contract", () => {
  it("Bohol: content img=0, featured feedThumbnail set, body markdown has no image", async () => {
    const { adapter, ctx } = resolveExternalBoardAdapter(
      "https://www.tourism.gov.ph/destination/central-visayas/"
    );
    const items = await adapter!.discoverArticles(ctx, { limit: 20, pageFrom: 1, pageTo: 1 });
    const bohol = items.find((i) => /bohol/i.test(i.title) || i.canonicalUrl.includes("/bohol"));
    expect(bohol).toBeTruthy();
    const doc = bohol!.sampleDocument!;
    const bodyImgs = doc.nodes.filter((n) => n.type === "image").length;
    expect(bodyImgs).toBe(0);
    expect(String(doc.feedThumbnailSrc ?? "")).toMatch(/^https?:\/\//);
    const community = externalBoardDocumentToCommunityContent(doc);
    expect(community.images[0]).toBe(doc.feedThumbnailSrc);
    expect(community.content.includes("![")).toBe(false);
  }, 60_000);

  it("Bais stub: featured=0 and body images=0 is CASE1-ok", async () => {
    const { adapter, ctx } = resolveExternalBoardAdapter(
      "https://www.tourism.gov.ph/destination/central-visayas/"
    );
    const items = await adapter!.discoverArticles(ctx, { limit: 20, pageFrom: 1, pageTo: 1 });
    const bais = items.find((i) => /bais/i.test(i.title));
    expect(bais).toBeTruthy();
    const doc = bais!.sampleDocument!;
    expect(doc.nodes.filter((n) => n.type === "image").length).toBe(0);
    expect(doc.feedThumbnailSrc ?? null).toBeFalsy();
  }, 60_000);
});
