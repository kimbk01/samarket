import { describe, expect, it } from "vitest";
import { canWriteMoimBoard } from "@/components/moim/MoimMemberView";
import type { MoimBoardDto, MoimDetailDto } from "@/lib/moim/moim-api-types";

/** 감사 D4 — 공지 게시판 쓰기 = 공지 작성·고정 권한(pin_notice) 하나 (서버 moim_post_create 와 같은 판정) */
const moim = (role: MoimDetailDto["viewer"]["role"], pinNotice: boolean) =>
  ({ status: "active", platformState: "normal", viewer: { role }, can: { pin_notice: pinNotice } }) as unknown as MoimDetailDto;
const board = (kind: MoimBoardDto["kind"], writeMinRole: MoimBoardDto["writeMinRole"]) =>
  ({ id: "b", kind, name: null, writeMinRole, sortOrder: 1, isActive: true }) as MoimBoardDto;

describe("공지 게시판 쓰기 버튼", () => {
  it("운영진이라도 공지 권한이 부모임장 이상으로 올라가 있으면 공지 쓰기 버튼 없음", () => {
    expect(canWriteMoimBoard(moim("staff", false), board("notice", "staff"))).toBe(false);
  });
  it("공지 권한이 있으면 공지 쓰기 가능", () => {
    expect(canWriteMoimBoard(moim("staff", true), board("notice", "staff"))).toBe(true);
  });
  it("다른 게시판은 게시판 쓰기 등급 그대로", () => {
    expect(canWriteMoimBoard(moim("member", false), board("free", "member"))).toBe(true);
    expect(canWriteMoimBoard(moim("member", false), board("free", "staff"))).toBe(false);
  });
});
