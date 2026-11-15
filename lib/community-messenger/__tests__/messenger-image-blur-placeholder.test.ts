/**
 * SSOT M3 (깜빡임 0) — 흐린 미리보기: 서버 생성 → metadata → 화면 필드 → 실시간 알림 → 전체 삭제 제거.
 * 설계: docs/design/messenger-media-emoji-ssot-design-2026-11-15.md §2 M3.
 */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  buildMessengerImageBlurDataUrl,
  buildMessengerImageVariantBuffers,
  MESSENGER_IMAGE_BLUR_MAX_CHARS,
} from "@/lib/community-messenger/messenger-image-variants";
import {
  messengerImageBlurDataUrlOrNull,
  messengerImageClientFieldsFromMetadata,
} from "@/lib/community-messenger/messenger-image-message-map";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const ROOM = "3932dd99-2a06-402a-8041-e3f27af2fa81";
const SENDER = "11111111-1111-1111-1111-111111111111";
const MSG = "8c048d6c-a604-40b8-8c36-75b49e5cd2ed";
const BLUR = "data:image/webp;base64,UklGRhQAAABXRUJQVlA4IAgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=";

describe("흐린 미리보기 생성", () => {
  it("큰 사진에서도 16px WebP data URL 을 만들고 상한 안이다", async () => {
    const jpg = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 120, g: 80, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const url = await buildMessengerImageBlurDataUrl(jpg);
    expect(url).toMatch(/^data:image\/webp;base64,/);
    expect(url!.length).toBeLessThanOrEqual(MESSENGER_IMAGE_BLUR_MAX_CHARS);
    const raw = Buffer.from(url!.split(",")[1]!, "base64");
    const meta = await sharp(raw).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(16);
  });

  it("변환 결과(triple·gif)에 흐린 미리보기가 들어간다", async () => {
    const png = await sharp({ create: { width: 30, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .png()
      .toBuffer();
    const v = await buildMessengerImageVariantBuffers({ buf: png, mimeType: "image/png" });
    expect(v.kind).toBe("triple");
    if (v.kind === "triple") expect(v.blurDataUrl).toMatch(/^data:image\/webp;base64,/);

    const gif = await sharp({ create: { width: 20, height: 20, channels: 3, background: { r: 9, g: 9, b: 9 } } })
      .gif()
      .toBuffer();
    const g = await buildMessengerImageVariantBuffers({ buf: gif, mimeType: "image/gif" });
    expect(g.kind).toBe("original_only");
    if (g.kind === "original_only") expect(g.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it("깨진 입력은 null (사진 전송은 계속)", async () => {
    expect(await buildMessengerImageBlurDataUrl(Buffer.from("not an image"))).toBeNull();
  });
});

describe("metadata → 화면 필드", () => {
  it("한 장: image_blur → imageBlurDataUrl, 형식·길이 틀리면 버린다", () => {
    const ok = messengerImageClientFieldsFromMetadata(
      "image",
      { image_preview_url: "https://x/p.webp", image_original_url: "https://x/o.jpg", image_blur: BLUR },
      "https://x/t.webp"
    );
    expect(ok.imageBlurDataUrl).toBe(BLUR);
    expect(messengerImageBlurDataUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(messengerImageBlurDataUrlOrNull("https://x/t.webp")).toBeNull();
    expect(messengerImageBlurDataUrlOrNull(`data:image/webp;base64,${"A".repeat(2000)}`)).toBeNull();
    const bad = messengerImageClientFieldsFromMetadata("image", { image_blur: "data:text/html;base64,AAAA" }, "https://x/t.webp");
    expect(bad.imageBlurDataUrl).toBeUndefined();
  });

  it("앨범: image_blurs 길이가 칸 수와 같을 때만, 빠진 칸은 빈 문자열", () => {
    const meta = {
      image_thumb_urls: ["https://x/1.thumb.webp", "https://x/2.thumb.webp"],
      image_preview_urls: ["https://x/1.preview.webp", "https://x/2.preview.webp"],
      image_urls: ["https://x/1.jpg", "https://x/2.jpg"],
      image_blurs: [BLUR, ""],
    };
    expect(messengerImageClientFieldsFromMetadata("image", meta, "https://x/1.thumb.webp").imageAlbumBlurDataUrls).toEqual([
      BLUR,
      "",
    ]);
    const mismatch = { ...meta, image_blurs: [BLUR] };
    expect(messengerImageClientFieldsFromMetadata("image", mismatch, "https://x/1.thumb.webp").imageAlbumBlurDataUrls).toBeUndefined();
  });
});

describe("실시간 알림(bump) 왕복", () => {
  it("한 장·앨범 흐린 미리보기가 받는 쪽까지 간다", () => {
    const single = {
      id: MSG,
      roomId: ROOM,
      senderId: SENDER,
      senderLabel: "a",
      messageType: "image",
      content: "https://x/t.webp",
      createdAt: "2026-11-16T00:00:00.000Z",
      isMine: true,
      imageBlurDataUrl: BLUR,
    } as CommunityMessengerMessage;
    const row = serializeCommunityMessengerMessageForBump(single)!;
    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: SENDER, canonicalRoomId: ROOM, messageId: MSG, message: row },
      SENDER
    )!;
    expect(parsed.imageBlurDataUrl).toBe(BLUR);

    const album = {
      ...single,
      imageBlurDataUrl: undefined,
      imageAlbumUrls: ["https://x/1.thumb.webp", "https://x/2.thumb.webp"],
      imageAlbumBlurDataUrls: [BLUR, BLUR],
    } as CommunityMessengerMessage;
    const row2 = serializeCommunityMessengerMessageForBump(album)!;
    const parsed2 = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: SENDER, canonicalRoomId: ROOM, messageId: MSG, message: row2 },
      SENDER
    )!;
    expect(parsed2.imageAlbumBlurDataUrls).toEqual([BLUR, BLUR]);
  });
});
