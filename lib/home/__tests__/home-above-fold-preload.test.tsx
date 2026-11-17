import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeAboveFoldImagePreload } from "@/components/home-hub/HomeAboveFoldImagePreload";
import {
  HOME_BANNER_PRELOAD_MAX,
  resolveHomeAboveFoldBannerImageUrls,
} from "@/lib/home/home-above-fold-preload";
import type { HomeLayoutConfig } from "@/lib/home/home-layout-contract";

type Banner = HomeLayoutConfig["banners"][number];

function layoutWith(banners: Array<Partial<Banner>>, bannerVisible = true): HomeLayoutConfig {
  return {
    sections: [{ key: "banner", visible: bannerVisible, guestVisible: true }],
    banners: banners.map((b, i) => ({ id: `b${i}`, visible: true, audience: "all", imageUrl: `https://cdn.example/${i}.jpg`, ...b })),
  } as unknown as HomeLayoutConfig;
}

describe("home above-the-fold image preload (F3-b)", () => {
  it("lists visible banner images for both audiences, deduped, admin order, capped", () => {
    const urls = resolveHomeAboveFoldBannerImageUrls(
      layoutWith([
        { audience: "member", imageUrl: "https://cdn.example/m.jpg" },
        { audience: "guest", imageUrl: "https://cdn.example/g.jpg" },
        { audience: "all", imageUrl: "https://cdn.example/m.jpg" },
        { visible: false, imageUrl: "https://cdn.example/hidden.jpg" },
        { imageUrl: "" },
      ])
    );
    expect(urls).toEqual(["https://cdn.example/m.jpg", "https://cdn.example/g.jpg"]);
    const many = resolveHomeAboveFoldBannerImageUrls(layoutWith(Array.from({ length: 9 }, () => ({}))));
    expect(many).toHaveLength(HOME_BANNER_PRELOAD_MAX);
  });

  it("no banner section → nothing to preload", () => {
    expect(resolveHomeAboveFoldBannerImageUrls(layoutWith([{}], false))).toEqual([]);
  });

  it("server render emits <link rel=preload as=image> with the same URL the <img> uses", () => {
    const html = renderToString(<HomeAboveFoldImagePreload urls={["https://cdn.example/0.jpg"]} />);
    expect(html).toMatch(/<link[^>]*rel="preload"/);
    expect(html).toContain('as="image"');
    expect(html).toContain('href="https://cdn.example/0.jpg"');
  });

  it("HomeSurface renders the preload before HomeScreen", () => {
    const src = readFileSync(path.join(process.cwd(), "components/home-hub/HomeSurface.tsx"), "utf8");
    expect(src).toContain("<HomeAboveFoldImagePreload urls={resolveHomeAboveFoldBannerImageUrls(config)} />");
    expect(src.indexOf("<HomeAboveFoldImagePreload")).toBeLessThan(src.indexOf("<HomeScreen"));
  });
});
