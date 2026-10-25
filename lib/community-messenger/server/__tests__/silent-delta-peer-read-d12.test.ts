import { describe, expect, it } from "vitest";
import { buildSilentDeltaPeerReadReceipt } from "@/lib/community-messenger/server/load-community-messenger-room-silent-delta";

/** 1단계 결함 D-12 ② (2026-10-26): silent_delta 응답에 1:1 상대 읽음 위치. */

const ROOM = "c202326f-8109-4ce4-aa61-394f0a799e7d";
const PEER = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";

describe("D-12 ② silent_delta 상대 읽음 위치", () => {
  it("1:1 + 상대 1명 → readReceipt", () => {
    expect(
      buildSilentDeltaPeerReadReceipt(ROOM, "direct", [
        { user_id: PEER, last_read_at: "2026-10-25T19:44:02.850537+00:00", last_read_message_id: "4ccf4007-5728-486d-bf55-fe4184898e25" },
      ])
    ).toEqual({
      roomId: ROOM,
      readerUserId: PEER,
      lastReadAt: "2026-10-25T19:44:02.850537+00:00",
      lastReadMessageId: "4ccf4007-5728-486d-bf55-fe4184898e25",
    });
  });

  it("단체방·상대 2명 이상·행 없음 → null (지금과 같은 응답)", () => {
    const row = { user_id: PEER, last_read_at: null, last_read_message_id: null };
    expect(buildSilentDeltaPeerReadReceipt(ROOM, "private_group", [row])).toBeNull();
    expect(buildSilentDeltaPeerReadReceipt(ROOM, "direct", [row, { ...row, user_id: "x" }])).toBeNull();
    expect(buildSilentDeltaPeerReadReceipt(ROOM, "direct", [])).toBeNull();
    expect(buildSilentDeltaPeerReadReceipt(ROOM, "direct", null)).toBeNull();
  });
});
