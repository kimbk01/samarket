import { beforeEach, describe, expect, it, vi } from "vitest";

/** 모임 R5 — 알림 이동 위치(E4) · 모임장 변경 알림 하나(E16) · 신고 결과 벨 전용(E5) */

const appendCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: async (_sb: unknown, row: Record<string, unknown>) => {
    appendCalls.push(row);
    return true;
  },
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: async () => "ko",
  loadNotificationUserLanguages: async (_sb: unknown, ids: string[]) => new Map(ids.map((id) => [id, "ko" as const])),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({ listBlockedEitherWayAmong: async () => new Set() }));
vi.mock("@/lib/moim/server/moim-queries.server", () => ({ listMoimActorsFor: async () => [], loadMoimName: async () => "Moim" }));

import { BELL_ONLY_KINDS, moimNotifyLink, notifyMoimHostChanged, notifyMoimMany } from "@/lib/moim/server/moim-notify.server";

const nickSb = (nickname: string | null) =>
  ({
    from() {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: nickname === null ? null : { nickname }, error: null });
      return chain;
    },
  }) as never;

beforeEach(() => {
  appendCalls.length = 0;
});

describe("E4 moimNotifyLink — 받는 사람이 열 수 있는 곳", () => {
  const home = "/moim/m1";
  it("표 전 칸", () => {
    const active = { status: "active" as const, retentionEndedAt: null };
    const closed = { status: "closed" as const, retentionEndedAt: null };
    const ended = { status: "closed" as const, retentionEndedAt: "2026-11-01T00:00:00Z" };
    const deleted = { status: "deleted" as const, retentionEndedAt: null };
    // 결과 알림: 못 열면 모임 탭
    expect(moimNotifyLink(active, false, home, { result: true })).toBe(home);
    expect(moimNotifyLink(closed, true, home, { result: true })).toBe(home);
    expect(moimNotifyLink(closed, false, home, { result: true })).toBe("/moim");
    expect(moimNotifyLink(ended, true, home, { result: true })).toBe("/moim");
    expect(moimNotifyLink(deleted, true, home, { result: true })).toBe("/moim");
    // 결과 알림이 아니면: 못 열면 보내지 않음
    expect(moimNotifyLink(deleted, true, home, { result: false })).toBeNull();
    expect(moimNotifyLink(active, true, home, { result: false })).toBe(home);
    // 상태를 모름(옛 DB) = 원래 위치
    expect(moimNotifyLink(null, false, home, { result: true })).toBe(home);
  });
});

describe("E16 모임장 변경 알림 하나", () => {
  it("이름 = 모임 닉네임, 행위자 제외, 이동 = 모임 홈", async () => {
    await notifyMoimHostChanged(nickSb("새모임장"), "m1", "u-new", ["u-actor", "u-a"], "ref1", { actorId: "u-actor" });
    expect(appendCalls.map((r) => r.user_id)).toEqual(["u-a"]);
    expect(appendCalls[0]).toMatchObject({ link_url: "/moim/m1", bell_only: true });
    expect(String(appendCalls[0].body)).toContain("새모임장");
  });
  it("닉네임이 비면 대체 이름 키 · 삭제 모임은 보내지 않음", async () => {
    await notifyMoimHostChanged(nickSb(null), "m1", "u-new", ["u-a"], "ref2", { toNickname: "  " });
    expect((appendCalls[0].meta as { varKeys?: Record<string, string> }).varKeys).toEqual({ name: "notify_member_fallback_name" });
    appendCalls.length = 0;
    await notifyMoimHostChanged(nickSb("x"), "m1", "u-new", ["u-a"], "ref3", { moimStatus: "deleted" });
    expect(appendCalls).toHaveLength(0);
  });
});

describe("E5 모임 신고 결과 = 벨 전용", () => {
  it("bell_only 로 저장된다", async () => {
    expect(BELL_ONLY_KINDS.has("moim_report_result")).toBe(true);
    await notifyMoimMany(nickSb(null), ["u-r"], { kind: "moim_report_result", moimId: "m1", linkUrl: "/moim", dedupeRef: "r", vars: { moim: "Moim" } });
    expect(appendCalls[0]).toMatchObject({ bell_only: true, link_url: "/moim" });
  });
});
