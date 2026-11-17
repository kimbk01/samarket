/**
 * F3 (설계 2026-11-18 PR-1) 음성 영구 삭제 부활 — 실시간 저장소 사본에서도 행을 지워 재진입 병합에서 되살아나지 않는다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  getMessengerRealtimeRoomMessages,
  removeMessengerRealtimeRoomMessage,
  resetMessengerRealtimeStore,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import { mergePrimedTimelineSeedIntoExisting } from "@/lib/community-messenger/room/merge-primed-timeline-seed";

const msg = (id: string, type: CommunityMessengerMessage["messageType"] = "text"): CommunityMessengerMessage =>
  ({
    id,
    roomId: "r1",
    senderId: "u2",
    senderLabel: "B",
    messageType: type,
    content: id,
    createdAt: `2026-11-18T00:00:0${id.slice(-1)}.000Z`,
    isMine: false,
    callKind: null,
    callStatus: null,
  }) as CommunityMessengerMessage;

afterEach(() => resetMessengerRealtimeStore());

describe("F3 removeMessengerRealtimeRoomMessage", () => {
  it("실시간 사본에서 그 행만 지운다 — 다른 방·다른 행 유지, 없는 id 는 무변화", () => {
    useMessengerRealtimeStore.setState({
      messagesByRoomId: { r1: [msg("m1"), msg("m2", "voice"), msg("m3")], r2: [msg("m9")] },
    });
    const before = useMessengerRealtimeStore.getState();
    expect(removeMessengerRealtimeRoomMessage("r1", "nope")).toBe(false);
    expect(useMessengerRealtimeStore.getState()).toBe(before);
    expect(removeMessengerRealtimeRoomMessage("r1", "m2")).toBe(true);
    expect(getMessengerRealtimeRoomMessages("r1").map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(getMessengerRealtimeRoomMessages("r2").map((m) => m.id)).toEqual(["m9"]);
  });

  it("재진입 병합(사본 base)에서 삭제된 음성이 되살아나지 않는다", () => {
    useMessengerRealtimeStore.setState({ messagesByRoomId: { r1: [msg("m1"), msg("m2", "voice")] } });
    removeMessengerRealtimeRoomMessage("r1", "m2");
    const merged = mergePrimedTimelineSeedIntoExisting({ roomId: "r1", prev: [], seed: [msg("m1")] });
    expect(merged.map((m) => m.id)).toEqual(["m1"]);
  });

  it("방 안 hard_deleted 처리가 실시간 사본 삭제를 호출한다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts"),
      "utf8"
    );
    const block = src.slice(
      src.indexOf('if (messageAction === "hard_deleted")'),
      src.indexOf("const from = typeof payload.fromUserId")
    );
    expect(block).toContain("removeMessengerRealtimeRoomMessage(rid, deletedId)");
  });
});
