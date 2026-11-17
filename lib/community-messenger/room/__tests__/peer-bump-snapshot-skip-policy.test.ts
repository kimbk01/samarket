import { describe, expect, it } from "vitest";
import { shouldSkipPeerBumpSingleGet } from "@/lib/community-messenger/room/peer-bump-snapshot-skip-policy";

const text = {
  id: "11111111-1111-4111-8111-111111111111",
  messageType: "text" as const,
  replyToMessageId: null,
  replyPreviewText: null,
  senderLabel: "Kim",
};

describe("L1 shouldSkipPeerBumpSingleGet", () => {
  it("skips GET for a new peer text with a valid, untruncated snapshot", () => {
    expect(shouldSkipPeerBumpSingleGet({ snapshot: text, snapshotTruncated: false, existedLocallyBeforeMerge: false })).toBe(true);
    expect(
      shouldSkipPeerBumpSingleGet({
        snapshot: { ...text, messageType: "sticker" },
        snapshotTruncated: false,
        existedLocallyBeforeMerge: false,
      })
    ).toBe(true);
  });

  it("keeps GET when any condition fails", () => {
    const base = { snapshot: text, snapshotTruncated: false, existedLocallyBeforeMerge: false };
    expect(shouldSkipPeerBumpSingleGet({ ...base, snapshot: null })).toBe(false);
    expect(shouldSkipPeerBumpSingleGet({ ...base, snapshotTruncated: true })).toBe(false);
    /** 같은 id 갱신(수정·삭제·반응) */
    expect(shouldSkipPeerBumpSingleGet({ ...base, existedLocallyBeforeMerge: true })).toBe(false);
    for (const t of ["image", "file", "voice", "call_stub", "system"]) {
      expect(shouldSkipPeerBumpSingleGet({ ...base, snapshot: { ...text, messageType: t as never } })).toBe(false);
    }
    /** 답장인데 인용 문구 없음(cleared_at 수신자 — 서버가 스냅샷을 비움) */
    expect(
      shouldSkipPeerBumpSingleGet({ ...base, snapshot: { ...text, replyToMessageId: "22222222-2222-4222-8222-222222222222" } })
    ).toBe(false);
    expect(shouldSkipPeerBumpSingleGet({ ...base, snapshot: { ...text, senderLabel: "" } })).toBe(false);
  });

  it("reply with quote text is skippable", () => {
    expect(
      shouldSkipPeerBumpSingleGet({
        snapshot: { ...text, replyToMessageId: "22222222-2222-4222-8222-222222222222", replyPreviewText: "원문" },
        snapshotTruncated: false,
        existedLocallyBeforeMerge: false,
      })
    ).toBe(true);
  });
});
