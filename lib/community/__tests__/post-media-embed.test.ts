/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isImportedVideoLabel,
  originalImageUrl,
  parsePostVideoUrl,
  splitPostTextWithVideos,
} from "@/lib/community/post-media-embed";

const ID = "dQw4w9WgXcQ";

describe("parsePostVideoUrl", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, false],
    [`https://m.youtube.com/watch?feature=share&v=${ID}`, false],
    [`https://youtu.be/${ID}?si=abc`, false],
    [`https://www.youtube.com/embed/${ID}`, false],
    [`https://www.youtube-nocookie.com/embed/${ID}?rel=0`, false],
    [`//www.youtube.com/embed/${ID}`, false],
    [`https://www.youtube.com/shorts/${ID}`, true],
    [`https://youtube.com/live/${ID}`, false],
  ])("YouTube %s", (url, short) => {
    const v = parsePostVideoUrl(url);
    expect(v?.provider).toBe("youtube");
    if (v?.provider !== "youtube") return;
    expect(v.id).toBe(ID);
    expect(v.short).toBe(short);
    // The player URL is rebuilt from the id on the allowed embed host only.
    expect(v.embedSrc.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`)).toBe(true);
    expect(v.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });

  it("Vimeo page and player URLs", () => {
    expect(parsePostVideoUrl("https://vimeo.com/76979871")).toMatchObject({ provider: "vimeo", id: "76979871" });
    expect(parsePostVideoUrl("https://player.vimeo.com/video/76979871?h=x")).toMatchObject({
      provider: "vimeo",
      embedSrc: "https://player.vimeo.com/video/76979871?autoplay=1&playsinline=1",
    });
  });

  it("direct video files", () => {
    expect(parsePostVideoUrl("https://cdn.example.com/a/clip.MP4?x=1")).toMatchObject({ provider: "file" });
    expect(parsePostVideoUrl("https://x.supabase.co/storage/v1/object/public/post-images/u/v.webm")?.provider).toBe("file");
  });

  it.each([
    "javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ",
    "data:text/html,<script>",
    `https://evil.example/watch?v=${ID}`,
    `https://www.youtube.com.evil.example/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=short",
    `https://www.youtube.com/watch?v=${ID}"><script>`,
    "https://www.youtube.com/channel/UC123",
    "https://vimeo.com/channels/staffpicks",
    "https://player.vimeo.com/video/abc",
    "https://example.com/page.html",
    "ftp://example.com/a.mp4",
    "",
  ])("rejects %s", (url) => {
    expect(parsePostVideoUrl(url)).toBeNull();
  });
});

describe("splitPostTextWithVideos", () => {
  it("lifts a standalone video line out and keeps all other text", () => {
    const text = `첫 문단\n\nhttps://youtu.be/${ID}\n\n둘째 문단`;
    const segs = splitPostTextWithVideos(text);
    expect(segs.map((s) => s.kind)).toEqual(["text", "video", "text"]);
    expect(segs[0]).toEqual({ kind: "text", text: "첫 문단" });
    expect(segs[2]).toEqual({ kind: "text", text: "둘째 문단" });
  });

  it("imported '▶ label + URL' line becomes a player with its label", () => {
    const [seg] = splitPostTextWithVideos(`▶ YouTube 영상 보기 https://www.youtube.com/watch?v=${ID}`);
    expect(seg).toMatchObject({ kind: "video", label: "▶ YouTube 영상 보기" });
    expect(isImportedVideoLabel(seg!.kind === "video" ? seg!.label : "")).toBe(true);
  });

  it("a video URL inside a sentence stays text", () => {
    const text = `이 영상 https://youtu.be/${ID} 을 보면 필리핀 마닐라 교통 상황이 얼마나 복잡한지 아주 잘 알 수 있습니다 꼭 보세요`;
    expect(splitPostTextWithVideos(text)).toEqual([{ kind: "text", text }]);
  });

  it("text without videos is unchanged", () => {
    const text = "줄1\n\n줄2 https://example.com";
    expect(splitPostTextWithVideos(text)).toEqual([{ kind: "text", text }]);
  });
});

describe("originalImageUrl", () => {
  it("transform URL → stored original", () => {
    expect(
      originalImageUrl("https://p.supabase.co/storage/v1/render/image/public/post-images/a/b.webp?width=600&quality=70"),
    ).toBe("https://p.supabase.co/storage/v1/object/public/post-images/a/b.webp");
  });
  it("other URLs unchanged", () => {
    const u = "https://p.supabase.co/storage/v1/object/public/post-images/a/b.webp";
    expect(originalImageUrl(u)).toBe(u);
  });
});

describe("post detail renderers — no image link leaves the post", () => {
  const files = [
    "components/community/post-detail/CommunityPostDetailBody.tsx",
    "components/community/NeighborhoodInterleavedContent.tsx",
    "components/community/post-detail/ImportedRichContent.tsx",
  ];
  it.each(files)("%s opens images in the viewer", (f) => {
    const src = readFileSync(f, "utf8");
    expect(src).toContain("usePostImageViewer");
    expect(src).not.toMatch(/<a\s[^>]*href=\{(?:url|u|b\.url)\}/);
  });
  it("embeds only via the sandboxed player built from a validated id", () => {
    const src = readFileSync("components/common/media/PostVideoEmbed.tsx", "utf8");
    expect(src).toContain("src={video.embedSrc}");
    expect(src).toMatch(/sandbox="allow-scripts allow-same-origin allow-presentation/);
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).not.toContain("allow-top-navigation");
  });
  it("viewer keeps the DibayOverlayRoot back contract (no Capacitor backButton listener)", () => {
    const src = readFileSync("components/common/media/PostImageViewer.tsx", "utf8");
    expect(src).not.toContain('addListener("backButton"');
    expect(src).toContain("...window.history.state");
  });
});
