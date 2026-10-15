import { describe, expect, it } from "vitest";
import { getRoomPreviewText } from "@/lib/community-messenger/cm-home-list-copy";
import { collectMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";
import { roomMessagesTimelineFingerprint } from "@/lib/community-messenger/room/messenger-room-timeline-paint-model";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import type { CommunityMessengerMessage, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const ROOM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ME = "11111111-1111-4111-8111-111111111111";

function room(over: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return { id: ROOM, roomType: "direct", lastMessage: "", lastMessageAt: "2026-10-15T00:00:00Z", ...over } as CommunityMessengerRoomSummary;
}

function msg(over: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: "m1",
    roomId: ROOM,
    senderId: ME,
    senderLabel: "me",
    messageType: "text",
    content: "ㅋ",
    createdAt: "2026-10-15T00:00:00.000Z",
    isMine: true,
    callKind: null,
    callStatus: null,
    ...over,
  } as CommunityMessengerMessage;
}

describe("F4 list preview — no generic 시스템 메시지 for empty/real system tips", () => {
  it("empty room (system + '') falls through to no-messages copy, not 시스템 메시지", () => {
    const text = getRoomPreviewText(room({ lastMessageType: "system", lastMessage: "" }));
    expect(text).not.toMatch(/시스템 메시지|System message/);
  });
  it("real system text is shown (first line)", () => {
    const text = getRoomPreviewText(
      room({ lastMessageType: "system", lastMessage: "📋 주문 요약\n매장: X\n주문번호: SO1" })
    );
    expect(text).toBe("📋 주문 요약");
  });
  it("gift / sticker / post share have typed labels (no raw content)", () => {
    expect(["상품권", "Gift certificate"]).toContain(
      getRoomPreviewText(room({ lastMessageType: "gift_certificate", lastMessage: "raw-gift-token" }))
    );
    expect(["게시글 공유", "Shared post"]).toContain(
      getRoomPreviewText(room({ lastMessageType: "community_post_share", lastMessage: "{\"postId\":\"p\"}" }))
    );
    expect(getRoomPreviewText(room({ lastMessageType: "sticker", lastMessage: "u/stickers/a.webp" }))).not.toContain(
      "stickers/"
    );
  });
});

describe("media purge derived keys match upload route naming", () => {
  it("collects {id}.thumb.webp / {id}.preview.webp siblings and album URLs", () => {
    const base = "u1/community/messenger-image/r1";
    const pub = (k: string) => `https://x.supabase.co/storage/v1/object/public/post-images/${k}`;
    const paths = collectMessengerMediaStoragePaths({
      metadata: {
        storage_paths: [`${base}/a.jpg`, `${base}/b.png`],
        image_thumb_urls: [pub(`${base}/a.thumb.webp`), pub(`${base}/b.thumb.webp`)],
      },
      content: "",
    });
    expect(paths).toEqual(
      expect.arrayContaining([
        `${base}/a.jpg`,
        `${base}/a.thumb.webp`,
        `${base}/a.preview.webp`,
        `${base}/b.png`,
        `${base}/b.thumb.webp`,
        `${base}/b.preview.webp`,
      ])
    );
    expect(paths.some((p) => p.endsWith(".jpg.thumb"))).toBe(false);
    expect(paths.some((p) => p.includes(".thumb.thumb"))).toBe(false);
  });
});

describe("S3 timeline fingerprint detects in-place content change", () => {
  it("album enrichment on same id changes fingerprint", () => {
    const single = [msg({ id: "i1", messageType: "image", content: "t1" })];
    const album = [msg({ id: "i1", messageType: "image", content: "t1", imageAlbumUrls: ["t1", "t2"] })];
    expect(roomMessagesTimelineFingerprint(single)).not.toBe(roomMessagesTimelineFingerprint(album));
  });
  it("identical lists keep identical fingerprint", () => {
    const a = [msg({ id: "x" })];
    expect(roomMessagesTimelineFingerprint(a)).toBe(roomMessagesTimelineFingerprint([...a]));
  });
});

describe("pending dedupe uses clientMessageId when both sides have one", () => {
  it("ACK of first 'ㅋ' does not remove second pending 'ㅋ' with a different cid", () => {
    const prev = [
      { ...msg({ id: "pending:c1", clientMessageId: "c1" }), pending: true },
      { ...msg({ id: "pending:c2", clientMessageId: "c2" }), pending: true },
    ];
    const merged = mergeRoomMessages(prev, [msg({ id: "real-1", clientMessageId: "c1" })]);
    expect(merged.filter((m) => m.pending).map((m) => m.clientMessageId)).toEqual(["c2"]);
    expect(merged.some((m) => m.id === "real-1")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { messengerImageClientFieldsFromMetadata } from "@/lib/community-messenger/messenger-image-message-map";
import {
  parseCommunityMessengerBumpMessageSnapshot,
  serializeCommunityMessengerMessageForBump,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";

/** 실측 DB 행 b3be7fef (2026-10-15 06:30, iOS 2장 → APK 1장 표시) metadata 형태 */
const P = "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/u/community/messenger-image/r";
const albumMeta = {
  image_urls: [`${P}/a.jpg`, `${P}/b.jpg`],
  image_thumb_urls: [`${P}/a.thumb.webp`, `${P}/b.thumb.webp`],
  image_preview_urls: [`${P}/a.preview.webp`, `${P}/b.preview.webp`],
  storage_paths: ["u/community/messenger-image/r/a.jpg", "u/community/messenger-image/r/b.jpg"],
};

describe("F3 album — all tiers / realtime carry every item + originals", () => {
  it("metadata → 2 album cells with 2 originals", () => {
    const f = messengerImageClientFieldsFromMetadata("image", albumMeta, `${P}/a.thumb.webp`);
    expect(f.imageAlbumUrls).toHaveLength(2);
    expect(f.imageAlbumOriginalUrls).toEqual([`${P}/a.jpg`, `${P}/b.jpg`]);
  });
  it("bootstrap mapper no longer gates album fields on non-critical tier", () => {
    const src = readFileSync(resolve(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(src).not.toContain('!isCriticalTier && safeMt === "image"');
  });
  it("bump snapshot round-trips album + originals", () => {
    const sender = "11111111-1111-4111-8111-111111111111";
    const msgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const roomId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const row = serializeCommunityMessengerMessageForBump(
      msg({
        id: msgId,
        roomId,
        senderId: sender,
        messageType: "image",
        content: `${P}/a.thumb.webp`,
        imageAlbumUrls: [`${P}/a.thumb.webp`, `${P}/b.thumb.webp`],
        imageAlbumPreviewUrls: [`${P}/a.preview.webp`, `${P}/b.preview.webp`],
        imageAlbumOriginalUrls: [`${P}/a.jpg`, `${P}/b.jpg`],
      })
    );
    const parsed = parseCommunityMessengerBumpMessageSnapshot(
      { fromUserId: sender, canonicalRoomId: roomId, messageId: msgId, message: row },
      "22222222-2222-4222-8222-222222222222"
    );
    expect(parsed?.imageAlbumUrls).toHaveLength(2);
    expect(parsed?.imageAlbumOriginalUrls).toEqual([`${P}/a.jpg`, `${P}/b.jpg`]);
  });
});
