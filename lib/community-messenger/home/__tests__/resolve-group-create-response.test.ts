import { describe, expect, it } from "vitest";
import { resolveGroupCreateResponse } from "@/lib/community-messenger/home/resolve-group-create-response";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

/** D15 — 그룹 만들기 응답 판정 (비공개·오픈 그룹 만들기 두 곳 공용) */
describe("resolveGroupCreateResponse", () => {
  const summary = { id: "r1" } as unknown as CommunityMessengerRoomSummary;

  it("요약 있음 → 목록에 넣고 이동", () => {
    expect(resolveGroupCreateResponse(true, { ok: true, roomId: "r1", room: summary })).toEqual({
      kind: "insert_and_open",
      roomId: "r1",
      summary,
    });
  });

  it("방은 생겼고 요약 없음(일부 성공) → 서버 목록 재조회 후 이동, 오류 아님", () => {
    expect(resolveGroupCreateResponse(true, { ok: true, roomId: "r1", room: null })).toEqual({
      kind: "reload_and_open",
      roomId: "r1",
    });
    expect(resolveGroupCreateResponse(true, { ok: true, roomId: "r1" })).toEqual({
      kind: "reload_and_open",
      roomId: "r1",
    });
  });

  it("실패·roomId 없음 → 오류", () => {
    expect(resolveGroupCreateResponse(false, { ok: false, roomId: "r1" })).toEqual({ kind: "error" });
    expect(resolveGroupCreateResponse(true, { ok: false })).toEqual({ kind: "error" });
    expect(resolveGroupCreateResponse(true, { ok: true, roomId: " " })).toEqual({ kind: "error" });
  });
});
