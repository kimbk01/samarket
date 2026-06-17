import { describe, expect, it, vi, beforeEach } from "vitest";
import { shareCommunityPostViaNative } from "../community-share-native";
import { shareCommunityPostViaKakao } from "../community-share-kakao";
import { getKakaoJavascriptKey } from "../community-share-kakao";

vi.mock("../community-share-copy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../community-share-copy")>();
  return {
    ...actual,
    copyTextToClipboard: vi.fn().mockResolvedValue("clipboard"),
  };
});

describe("shareCommunityPostViaNative", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns cancelled on AbortError from navigator.share", async () => {
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(Object.assign(new Error("cancel"), { name: "AbortError" })),
    });
    const outcome = await shareCommunityPostViaNative({
      title: "T",
      text: "body",
      url: "https://samarket.vercel.app/community/posts/x?utm_source=dibay_share",
    });
    expect(outcome).toBe("cancelled");
  });

  it("falls back to copy when share unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const outcome = await shareCommunityPostViaNative({
      title: "T",
      text: "body",
      url: "https://samarket.vercel.app/community/posts/x?utm_source=dibay_share",
    });
    expect(outcome).toBe("copied");
  });
});

describe("shareCommunityPostViaKakao", () => {
  it("returns failed and copies when key missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY", "");
    expect(getKakaoJavascriptKey()).toBeNull();
    const outcome = await shareCommunityPostViaKakao(
      {
        objectType: "feed",
        content: {
          title: "T",
          description: "D",
          imageUrl: "https://example.com/i.png",
          link: { mobileWebUrl: "https://x", webUrl: "https://x" },
        },
        buttons: [],
      },
      "https://samarket.vercel.app/community/posts/x?utm_source=dibay_share"
    );
    expect(outcome).toBe("failed");
  });
});
