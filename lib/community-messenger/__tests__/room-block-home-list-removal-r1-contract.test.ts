import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 1단계 문서 §17 R-1: 방 화면 차단 → 서버가 숨긴 방을 홈 목록·캐시에서 즉시 제거 (실기기 22:23 PHT 결함) */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("room block removes hidden rooms from home", () => {
  it("공용 함수: 캐시 정리 + bus remove_room(blocked_hidden)", () => {
    const leave = read("lib/community-messenger/home/messenger-home-room-leave-client.ts");
    expect(leave).toContain("export function applyMessengerHomeRoomsHiddenByBlock(");
    expect(leave).toMatch(/syncMessengerHomeAfterRoomLeave\(rid\);\s*postCommunityMessengerBusEvent\(\{\s*type: "cm.home.remove_room",\s*roomId: rid,\s*reason: "blocked_hidden"/);
    const bus = read("lib/community-messenger/multi-tab-bus.ts");
    expect(bus).toContain('d.reason !== "blocked_hidden"');
  });

  it("방 상단 바·메시지 메뉴 차단 모두 사용", () => {
    expect(read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2PeerNotice.tsx")).toContain(
      "applyMessengerHomeRoomsHiddenByBlock(json.hiddenRoomIds);"
    );
    expect(read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts")).toContain(
      "applyMessengerHomeRoomsHiddenByBlock(json.hiddenRoomIds);"
    );
  });
});
