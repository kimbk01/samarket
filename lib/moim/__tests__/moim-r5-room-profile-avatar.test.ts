import { describe, expect, it } from "vitest";
import { resolveRoomProfileLite } from "@/lib/community-messenger/service";

/**
 * 모임 R5 A19 — 모임 사진을 비우면 DIBAY 사진으로 대신 채우지 않는다 (null → 머리글자 동그라미).
 * 고치기 전: 방 프로필 사진이 없으면 메신저 기본 사진(= DIBAY 사진)을 썼다.
 */
const base = { id: "u1", label: "닉네임", avatarUrl: "https://img/dibay.jpg", subtitle: "@minji" } as never;
const aliasRow = (avatar: string | null) =>
  ({ room_id: "r1", user_id: "u1", identity_mode: "alias", display_name: "민지", bio: "", avatar_url: avatar }) as never;

describe("A19 resolveRoomProfileLite", () => {
  it("모임 방 + 별칭 + 방 사진 없음 → null (고치기 전: DIBAY 사진)", () => {
    const out = resolveRoomProfileLite(base, aliasRow(null), { moimOwned: true });
    expect(out?.avatarUrl).toBeNull();
    expect(out?.aliasProfile?.avatarUrl).toBeNull();
    expect(out?.label).toBe("민지");
  });

  it("모임 방 + 방 사진 있음 → 모임 사진", () => {
    expect(resolveRoomProfileLite(base, aliasRow("https://img/moim.jpg"), { moimOwned: true })?.avatarUrl).toBe("https://img/moim.jpg");
  });

  it("모임 방 + 방 프로필 행 없음 · 별칭 아님 → null", () => {
    expect(resolveRoomProfileLite(base, undefined, { moimOwned: true })?.avatarUrl).toBeNull();
    const real = { room_id: "r1", user_id: "u1", identity_mode: "real_name", display_name: "", bio: "", avatar_url: null } as never;
    expect(resolveRoomProfileLite(base, real, { moimOwned: true })?.avatarUrl).toBeNull();
  });

  it("일반 별칭 방 → 기존 대체 유지(DIBAY 사진)", () => {
    expect(resolveRoomProfileLite(base, aliasRow(null))?.avatarUrl).toBe("https://img/dibay.jpg");
    expect(resolveRoomProfileLite(base, undefined)?.avatarUrl).toBe("https://img/dibay.jpg");
  });
});
