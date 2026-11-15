// @vitest-environment jsdom
/**
 * 사진 메시지 한 번에 끝까지: 실제 업로드 처리(sharp) → 정리 → 저장 metadata → DB 읽기 매퍼 / 서버 응답 →
 * 실시간 알림 왕복 → 말풍선 화면. 한 단계라도 필드(크기·흐린 미리보기·버킷)를 빠뜨리면 실패한다.
 * (2026-11-14 버킷 누락 · 2026-11-16 흐린 미리보기 누락 — 둘 다 단계 사이에서 값이 버려졌다)
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessengerChatImageBubble } from "@/components/community-messenger/room/MessengerChatImageBubble";
import { processMessengerImageUploads } from "@/lib/community-messenger/server/messenger-image-upload-process";
import {
  communityMessengerBuiltImageClientMessage,
  communityMessengerImageMessageMetadata,
  normalizeCommunityMessengerImageSendItems,
} from "@/lib/community-messenger/messenger-image-send-items";
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const ROOM = "1de13b3e-ba94-49bf-b611-582ef3f39ab9";
const SENDER = "0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc";
const VIEWER = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";
const MSG = "8c048d6c-a604-40b8-8c36-75b49e5cd2ed";

async function jpeg(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 120, b: 210 } } })
    .jpeg()
    .toBuffer();
}

async function processed(sizes: Array<[number, number]>) {
  let n = 0;
  const r = await processMessengerImageUploads({
    bucket: {
      upload: async () => ({ error: null }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/messenger-media/${path}` },
      }),
    },
    baseDir: `${SENDER}/community/messenger-image/${ROOM}`,
    images: await Promise.all(sizes.map(async ([w, h]) => ({ buf: await jpeg(w, h), mimeType: "image/jpeg" }))),
    newId: () => `id${++n}`,
  });
  if (!r.ok) throw new Error(r.error);
  return normalizeCommunityMessengerImageSendItems(r.items.map((it) => ({ ...it, storageBucket: "messenger-media" })));
}

describe("사진 메시지 파이프라인 — 업로드부터 화면까지", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("한 장: 크기·흐린 미리보기·버킷이 저장·DB 읽기·응답·실시간·화면까지 남는다", async () => {
    const items = await processed([[1600, 1200]]);
    const meta = communityMessengerImageMessageMetadata(items);
    expect(meta.storage_bucket).toBe("messenger-media");
    expect(meta.image_width).toBe(1600);
    expect(meta.image_height).toBe(1200);
    expect(String(meta.image_blur)).toMatch(/^data:image\/webp;base64,/);

    // DB 읽기 경로(다시 들어올 때)
    const fromDb = messengerImageClientFieldsFromMetadata("image", meta, items[0]!.chatPublicUrl);
    expect(fromDb.imageWidth).toBe(1600);
    expect(fromDb.imageBlurDataUrl).toBe(meta.image_blur);

    // 서버 응답 → 실시간 알림 왕복(받는 쪽)
    const built = communityMessengerBuiltImageClientMessage(items, "2026-11-16T00:00:00.000Z", MSG, ROOM, SENDER, "me");
    expect(built.imageBlurDataUrl).toBe(meta.image_blur);
    const bump = serializeCommunityMessengerMessageForBump(built)!;
    const recv = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: SENDER, canonicalRoomId: ROOM, messageId: MSG, message: bump },
      VIEWER
    )!;
    expect(recv.imageWidth).toBe(1600);
    expect(recv.imageBlurDataUrl).toBe(meta.image_blur);

    // 받는 쪽 화면: 받기 전부터 흐린 층 + 텔레그램 규칙 크기(jsdom 폭 1024 → 최대 360, 4:3 → 360×270)
    act(() => root.render(<MessengerChatImageBubble item={recv} onOpenLightbox={vi.fn()} />));
    expect(host.querySelector("[data-cm-photo-blur]")).not.toBeNull();
    const box = (host.querySelector("img") as HTMLImageElement).parentElement as HTMLElement;
    expect(box.style.height).toBe("270px");
  });

  it("묶음: 칸별 흐린 미리보기가 저장·DB 읽기·응답·실시간·화면까지 남는다", async () => {
    const items = await processed([
      [1080, 1920],
      [1920, 1080],
    ]);
    const meta = communityMessengerImageMessageMetadata(items);
    expect((meta.image_blurs as string[]).every((b) => /^data:image\/webp;base64,/.test(b))).toBe(true);
    const fromDb = messengerImageClientFieldsFromMetadata("image", meta, items[0]!.chatPublicUrl);
    expect(fromDb.imageAlbumBlurDataUrls).toEqual(meta.image_blurs);
    const built = communityMessengerBuiltImageClientMessage(items, "2026-11-16T00:00:00.000Z", MSG, ROOM, SENDER, "me");
    const recv = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: SENDER, canonicalRoomId: ROOM, messageId: MSG, message: serializeCommunityMessengerMessageForBump(built)! },
      VIEWER
    )!;
    expect(recv.imageAlbumBlurDataUrls).toEqual(meta.image_blurs);
    act(() => root.render(<MessengerChatImageBubble item={recv} onOpenLightbox={vi.fn()} />));
    expect(host.querySelectorAll("[data-cm-photo-blur]")).toHaveLength(2);
  });

  it("보내는 중(F1): 내 폰 사진 크기가 실린 보내는 중 행은 서버 메시지와 같은 칸 크기다", async () => {
    const items = await processed([[1600, 1200]]);
    const server = communityMessengerBuiltImageClientMessage(items, "2026-11-16T00:00:00.000Z", MSG, ROOM, SENDER, "me");
    // 컨트롤러가 미리 디코딩으로 잰 크기를 싣는 보내는 중 행(pending 은 병합에서 지워지므로 일부러 false)
    const optimistic = {
      id: `pending:image:${ROOM}:1`,
      roomId: ROOM,
      senderId: SENDER,
      senderLabel: "me",
      messageType: "image",
      content: "blob:local",
      imagePreviewUrl: "blob:local",
      imageOriginalUrl: "blob:local",
      imageWidth: 1600,
      imageHeight: 1200,
      createdAt: "2026-11-16T00:00:00.000Z",
      isMine: true,
      pending: false,
    } as CommunityMessengerMessage;
    act(() => root.render(<MessengerChatImageBubble item={optimistic} onOpenLightbox={vi.fn()} />));
    const h1 = ((host.querySelector("img") as HTMLImageElement).parentElement as HTMLElement).style.height;
    act(() => root.render(<MessengerChatImageBubble item={server} onOpenLightbox={vi.fn()} />));
    const h2 = ((host.querySelector("img") as HTMLImageElement).parentElement as HTMLElement).style.height;
    expect(h1).toBe(h2);
  });
});
