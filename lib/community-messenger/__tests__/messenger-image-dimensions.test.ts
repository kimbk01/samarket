import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildMessengerImageVariantBuffers } from "@/lib/community-messenger/messenger-image-variants";
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const ROOM = "3932dd99-2a06-402a-8041-e3f27af2fa81";
const SENDER = "11111111-1111-1111-1111-111111111111";
const MSG = "8c048d6c-a604-40b8-8c36-75b49e5cd2ed";

describe("messenger image display dimensions", () => {
  it("server variants report display size (EXIF rotation baked in)", async () => {
    const png = await sharp({
      create: { width: 30, height: 60, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const v = await buildMessengerImageVariantBuffers({ buf: png, mimeType: "image/png" });
    expect(v.kind).toBe("triple");
    if (v.kind !== "triple") return;
    expect(v.width).toBe(30);
    expect(v.height).toBe(60);

    // EXIF orientation 6 (90° CW): stored 60x30 → displayed 30x60
    const rotated = await sharp({
      create: { width: 60, height: 30, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const r = await buildMessengerImageVariantBuffers({ buf: rotated, mimeType: "image/jpeg" });
    expect(r.kind).toBe("triple");
    if (r.kind !== "triple") return;
    expect(r.width).toBe(30);
    expect(r.height).toBe(60);
  });

  it("metadata image_width/image_height map to client fields; invalid values are ignored", () => {
    const ok = messengerImageClientFieldsFromMetadata(
      "image",
      { image_preview_url: "https://x/p.webp", image_original_url: "https://x/o.jpg", image_width: 1179, image_height: 2556 },
      "https://x/t.webp"
    );
    expect(ok.imageWidth).toBe(1179);
    expect(ok.imageHeight).toBe(2556);

    const legacy = messengerImageClientFieldsFromMetadata(
      "image",
      { image_preview_url: "https://x/p.webp", image_original_url: "https://x/o.jpg" },
      "https://x/t.webp"
    );
    expect(legacy.imageWidth).toBeUndefined();

    const bad = messengerImageClientFieldsFromMetadata(
      "image",
      { image_width: 0, image_height: "abc" },
      "https://x/t.webp"
    );
    expect(bad.imageWidth).toBeUndefined();
    expect(bad.imageHeight).toBeUndefined();
  });

  it("realtime bump snapshot carries single-image dimensions", () => {
    const msg: CommunityMessengerMessage = {
      id: MSG,
      roomId: ROOM,
      senderId: SENDER,
      senderLabel: "me",
      messageType: "image",
      content: "https://x/t.webp",
      createdAt: "2026-10-16T03:29:37.010Z",
      isMine: true,
      callKind: null,
      callStatus: null,
      imagePreviewUrl: "https://x/p.webp",
      imageOriginalUrl: "https://x/o.jpg",
      imageWidth: 1179,
      imageHeight: 2556,
    };
    const row = serializeCommunityMessengerMessageForBump(msg);
    expect(row?.imageWidth).toBe(1179);
    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: SENDER, roomId: ROOM, messageId: MSG, message: row },
      "edc8c2f0-2673-4ca8-9d63-92a609d556f4"
    );
    expect(parsed?.imageWidth).toBe(1179);
    expect(parsed?.imageHeight).toBe(2556);
  });
});
