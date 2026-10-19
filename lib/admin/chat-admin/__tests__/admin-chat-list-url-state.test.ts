import { describe, expect, it } from "vitest";
import {
  buildAdminChatRoomListApiSearch,
  buildAdminChatRoomListSearch,
  clampAdminChatListLimit,
  decodeAdminKeysetCursor,
  encodeAdminKeysetCursor,
  parseAdminChatRoomListQuery,
  sanitizeAdminSearchTerm,
} from "@/lib/admin/chat-admin/admin-chat-list-url-state";
import { chatRoomListHref } from "@/lib/admin/metrics/chat-metrics";
import { memberMessengerAdminHref } from "@/lib/admin-users/member-deep-links";
import { adminMemberMessengerHref } from "@/lib/admin-users/admin-member-messenger-link";

const UID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("채팅방 목록 URL 상태 (C-11)", () => {
  it("parses type/status/q/user_id/reported/cursor and drops invalid values", () => {
    const q = parseAdminChatRoomListQuery(
      new URLSearchParams(`type=trade&status=blocked&q=hello&user_id=${UID}&reported=1&cursor=x~y`)
    );
    expect(q).toMatchObject({ type: "trade", status: "blocked", q: "hello", userId: UID, reported: true });
    const bad = parseAdminChatRoomListQuery(new URLSearchParams("type=community&status=deleted&user_id=abc"));
    expect(bad).toMatchObject({ type: "all", status: "", userId: "" });
  });

  it("fixed-type screens ignore ?type and accept dashboard domain/activity/idle params", () => {
    const href = chatRoomListHref("general_direct", { status: "archived", activity: "7d" });
    const sp = new URLSearchParams(href.split("?")[1]);
    const q = parseAdminChatRoomListQuery(sp, "general_direct");
    expect(q).toMatchObject({ type: "general_direct", status: "archived", activity: "7d" });
    const idle = parseAdminChatRoomListQuery(new URLSearchParams("domain=group&idle=90"));
    expect(idle).toMatchObject({ type: "group", idleDays: 90 });
  });

  it("legacy ?room= deep link becomes the search term", () => {
    expect(parseAdminChatRoomListQuery(new URLSearchParams(`room=${UID}`)).q).toBe(UID);
  });

  it("round-trips build → parse; defaults omitted; fixed type omitted", () => {
    expect(buildAdminChatRoomListSearch({ type: "all" })).toBe("");
    const s = buildAdminChatRoomListSearch({ type: "store_order", status: "active", userId: UID, cursor: "c" });
    expect(parseAdminChatRoomListQuery(new URLSearchParams(s.slice(1)))).toMatchObject({
      type: "store_order",
      status: "active",
      userId: UID,
      cursor: "c",
    });
    expect(buildAdminChatRoomListSearch({ type: "group", q: "a" }, { fixedType: true })).toBe("?q=a");
    const api = buildAdminChatRoomListApiSearch(parseAdminChatRoomListQuery(new URLSearchParams("")), 30);
    expect(api).toBe("?type=all&limit=30");
  });

  it("sanitizes PostgREST-reserved characters from search", () => {
    expect(sanitizeAdminSearchTerm("a,b(c)%*d\"e'")).toBe("a b c d e");
    expect(sanitizeAdminSearchTerm("x".repeat(200))).toHaveLength(80);
  });

  it("keyset cursor encode/decode (null ts = NULLS LAST segment)", () => {
    const ts = "2026-10-19T06:07:34.123456+00:00";
    const id = "11111111-2222-4333-8444-555555555555";
    expect(decodeAdminKeysetCursor(encodeAdminKeysetCursor({ ts, id }))).toEqual({ ts, id });
    expect(decodeAdminKeysetCursor(`~${id}`)).toEqual({ ts: "", id });
    expect(decodeAdminKeysetCursor("garbage")).toBeNull();
    expect(decodeAdminKeysetCursor("not-a-date~abc")).toBeNull();
  });

  it("clamps limit", () => {
    expect(clampAdminChatListLimit(null)).toBe(30);
    expect(clampAdminChatListLimit("500")).toBe(100);
  });
});

describe("회원 → 채팅 링크는 참여자 user_id 서버 필터 (C-10)", () => {
  it("memberMessengerAdminHref / adminMemberMessengerHref → /admin/chats?user_id=", () => {
    for (const href of [memberMessengerAdminHref(UID), adminMemberMessengerHref(` ${UID} `)]) {
      expect(href).toBe(`/admin/chats?user_id=${UID}`);
      const q = parseAdminChatRoomListQuery(new URLSearchParams(href.split("?")[1]));
      expect(q.userId).toBe(UID);
      expect(q.q).toBe("");
    }
  });
});
