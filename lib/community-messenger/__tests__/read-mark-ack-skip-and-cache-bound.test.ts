import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMarkReadRecentResultCache,
  markReadRequestWantsBadgeAck,
} from "@/lib/community-messenger/server/mark-read-recent-result-cache";
import { buildCommunityMessengerMarkReadPatchBody } from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("결함 2-1 — mark_read 최근 결과 캐시는 쌓이지 않는다", () => {
  it("만료된 항목은 다음 set 때 지워진다", () => {
    const c = createMarkReadRecentResultCache<number>(100);
    for (let i = 0; i < 50; i += 1) c.set(`k${i}`, i, 400, 1_000);
    expect(c.size()).toBe(50);
    c.set("fresh", 1, 400, 2_000);
    expect(c.size()).toBe(1);
  });

  it("만료 전 get 은 값, 만료 후 get 은 null 이고 항목도 지운다", () => {
    const c = createMarkReadRecentResultCache<string>();
    c.set("a", "v", 400, 1_000);
    expect(c.get("a", 1_399)).toBe("v");
    expect(c.get("a", 1_400)).toBeNull();
    expect(c.size()).toBe(0);
  });

  it("상한을 넘으면 오래된 것부터 지운다", () => {
    const c = createMarkReadRecentResultCache<number>(3);
    for (let i = 0; i < 10; i += 1) c.set(`k${i}`, i, 60_000, 1_000);
    expect(c.size()).toBe(3);
    expect(c.get("k0", 1_001)).toBeNull();
    expect(c.get("k9", 1_001)).toBe(9);
  });

  it("route 는 Map 직접 대신 상한 캐시를 쓴다", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/route.ts");
    expect(src).toContain("createMarkReadRecentResultCache<MarkReadInflightBundle>()");
    expect(src).not.toMatch(/communityMessengerMarkReadRecentResult = new Map/);
  });
});

describe("결함 2-2 — 응답을 안 쓰는 호출은 배지 재계산을 건너뛴다", () => {
  it("플래그가 없으면(방 열기·구 클라이언트) 계산한다", () => {
    expect(markReadRequestWantsBadgeAck({ action: "mark_read", flushOpen: true })).toBe(true);
    expect(markReadRequestWantsBadgeAck(null)).toBe(true);
    expect(markReadRequestWantsBadgeAck({ skipBadgeAck: "true" })).toBe(true);
    expect(markReadRequestWantsBadgeAck({ skipBadgeAck: true })).toBe(false);
  });

  it("본문 생성기: 기본은 예전과 같고, 옵션일 때만 skipBadgeAck", () => {
    expect(buildCommunityMessengerMarkReadPatchBody()).toEqual({ action: "mark_read", flushOpen: true });
    expect(buildCommunityMessengerMarkReadPatchBody("m1")).toEqual({
      action: "mark_read",
      flushOpen: true,
      lastReadMessageId: "m1",
    });
    expect(buildCommunityMessengerMarkReadPatchBody(null, { skipBadgeAck: true })).toEqual({
      action: "mark_read",
      flushOpen: true,
      skipBadgeAck: true,
    });
  });

  it("홈·탭 목록(모두 읽음 포함)만 플래그를 보내고, 방 열기는 보내지 않는다", () => {
    expect(read("components/community-messenger/CommunityMessengerHome.tsx")).toContain(
      "buildCommunityMessengerMarkReadPatchBody(null, { skipBadgeAck: true })"
    );
    expect(read("lib/community-messenger/pillar-chat-list/use-pillar-mark-read.ts")).toContain(
      "buildCommunityMessengerMarkReadPatchBody(null, { skipBadgeAck: true })"
    );
    const roomOpen = read("lib/community-messenger/room/use-messenger-room-open-mark-read-effect.ts");
    expect(roomOpen).toContain("buildCommunityMessengerMarkReadPatchBody(lastReadMessageId)");
    expect(roomOpen).not.toContain("skipBadgeAck");
  });

  it("route: 플래그면 재계산 없이 skip, 재사용 키는 ack 여부로 나뉜다", () => {
    const src = read("app/api/community-messenger/rooms/[roomId]/route.ts");
    const skipIdx = src.indexOf("} else if (!wantsBadgeAck) {");
    const issueIdx = src.indexOf("issueDomainBadgeAuthorityForAck(getSupabaseServer()");
    expect(skipIdx).toBeGreaterThan(0);
    expect(issueIdx).toBeGreaterThan(skipIdx);
    expect(src).toContain('const ack = wantsBadgeAck ? "ack" : "noack"');
    expect(src).toContain("communityMessengerMarkReadInflightKey(auth.userId, roomId, body, wantsBadgeAck)");
  });
});
