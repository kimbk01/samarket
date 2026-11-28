import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveRoomProfileLite } from "@/lib/community-messenger/service";

/**
 * 모임 R5 실기 FAIL (2026-11-28 19:57 PHT, Xiaomi zxzx11): 모임 방 서랍의 멤버 사진이 이니셜 「Z」.
 * 원인 — 첫 응답(critical·defer)은 방 프로필을 읽지 않는데, 모임 방은 방 프로필이 없으면 DIBAY 사진으로 대신 채우지 않는다(A19).
 */
describe("모임 방 첫 응답 멤버 사진", () => {
  const base = { id: "u1", label: "nick", subtitle: "@dibay", avatarUrl: "https://x.test/dibay.jpg" } as never;
  const row = { room_id: "r1", user_id: "u1", identity_mode: "alias", display_name: "모임닉", bio: "", avatar_url: "https://x.test/moim.jpg" } as never;

  it("방 프로필이 있으면 모임 사진을 쓴다", () => {
    expect(resolveRoomProfileLite(base, row, { moimOwned: true })?.avatarUrl).toBe("https://x.test/moim.jpg");
  });

  it("방 프로필이 없으면(첫 응답에서 안 읽음) 사진이 비어 이니셜이 된다 — 그래서 모임 방은 첫 응답에서도 방 프로필을 읽어야 한다", () => {
    expect(resolveRoomProfileLite(base, undefined, { moimOwned: true })?.avatarUrl).toBeNull();
  });

  it("구조 확인 — 첫 응답(critical·defer)에서도 모임 방이면 방 프로필을 읽는다 (동작 시험 아님)", () => {
    const src = readFileSync("lib/community-messenger/service.ts", "utf8");
    expect(src).toContain("const roomProfileMapPromise = (deferSecondary || isCriticalTier) && !roomIsMoimOwnedForProfiles");
  });
});
