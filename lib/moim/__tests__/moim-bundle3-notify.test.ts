import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 3번 묶음 — 알림 (2026-11-28 · 설계 docs/audit/moim-bundle3-design-2026-11-28.md)
 * N1 계약 §7 「푸시 X」 4종 = 벨만 · E1 언어 일괄·동시 실행 상한 · B2·B3 가입 알림.
 */

const appendCalls: Array<Record<string, unknown>> = [];
let inFlight = 0;
let maxInFlight = 0;
const appendUserNotification = vi.fn(async (_sb: unknown, row: Record<string, unknown>) => {
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  appendCalls.push(row);
  await new Promise((r) => setTimeout(r, 2));
  inFlight -= 1;
  return true;
});
const loadOne = vi.fn(async () => "ko" as const);
const loadMany = vi.fn(async (_sb: unknown, ids: string[]) => new Map(ids.map((id) => [id, "en" as const])));
const listMoimActorsFor = vi.fn(async () => ["u-decider"]);

vi.mock("@/lib/notifications/append-user-notification", () => ({ appendUserNotification: (...a: [unknown, Record<string, unknown>]) => appendUserNotification(...a) }));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: (...a: unknown[]) => loadOne(...(a as [])),
  loadNotificationUserLanguages: (...a: [unknown, string[]]) => loadMany(...a),
}));
vi.mock("@/lib/moim/server/moim-queries.server", () => ({
  listMoimActorsFor: (...a: unknown[]) => listMoimActorsFor(...(a as [])),
  loadMoimName: async () => "Moim",
}));

import { notifyMoimJoinRequested, notifyMoimMany, notifyMoimMemberJoined } from "@/lib/moim/server/moim-notify.server";

function fakeSb(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
      return chain;
    },
  } as never;
}

const base = { moimId: "m1", linkUrl: "/moim/m1", dedupeRef: "r1", vars: { moim: "Moim" } };

beforeEach(() => {
  vi.clearAllMocks();
  appendCalls.length = 0;
  inFlight = 0;
  maxInFlight = 0;
});

describe("N1 계약 §7 「푸시 X」 = 벨만 (푸시·소리 없음)", () => {
  it.each(["moim_member_joined", "moim_role_changed", "moim_host_changed", "moim_post_new"] as const)("%s → bell_only", async (kind) => {
    await notifyMoimMany(fakeSb({}), ["u1"], { ...base, kind });
    expect(appendCalls[0]).toMatchObject({ bell_only: true });
  });

  it.each(["moim_notice_posted", "moim_join_requested", "moim_invited", "moim_schedule_cancelled"] as const)("%s → 지금처럼 푸시", async (kind) => {
    await notifyMoimMany(fakeSb({}), ["u1"], { ...base, kind });
    expect(appendCalls[0]).not.toHaveProperty("bell_only");
  });
});

describe("E1 여러 명 발송", () => {
  it("언어는 한 번에 읽고(받는 사람마다 읽지 않음), 각 사람의 언어로 문구를 만든다", async () => {
    const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
    await notifyMoimMany(fakeSb({}), ids, { ...base, kind: "moim_notice_posted" });
    expect(loadMany).toHaveBeenCalledTimes(1);
    expect(loadOne).not.toHaveBeenCalled();
    expect(appendCalls).toHaveLength(30);
  });

  it("동시에 저장·발송하는 수는 최대 8", async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `u${i}`);
    await notifyMoimMany(fakeSb({}), ids, { ...base, kind: "moim_notice_posted" });
    expect(maxInFlight).toBeLessThanOrEqual(8);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("받는 사람 1명이면 단건 언어 조회 (이전과 같음)", async () => {
    await notifyMoimMany(fakeSb({}), ["u1"], { ...base, kind: "moim_notice_posted" });
    expect(loadMany).not.toHaveBeenCalled();
    expect(loadOne).toHaveBeenCalledTimes(1);
  });
});

describe("B2·B3 가입 알림", () => {
  it("B2 새 멤버 → 모임장에게 moim_member_joined (벨만, 가입 1건 = 1건)", async () => {
    await notifyMoimMemberJoined(fakeSb({ moims: [{ host_user_id: "u-host" }], moim_members: [{ nickname: "Kim", joined_at: "t1" }] }), "m1", "u-new", "");
    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]).toMatchObject({
      user_id: "u-host",
      bell_only: true,
      link_url: "/moim/m1/manage/members",
      dedupe_key: "moim:moim_member_joined:m1:u-new:t1:u-host",
    });
  });

  it("B2 같은 사람이 같은 모임장의 다른 모임에 가입하거나 재가입하면 알림 키가 달라 각각 저장된다 (재감사 M1)", async () => {
    await notifyMoimMemberJoined(fakeSb({ moims: [{ host_user_id: "u-host" }], moim_members: [{ nickname: "Kim", joined_at: "t1" }] }), "m1", "u-new", "");
    await notifyMoimMemberJoined(fakeSb({ moims: [{ host_user_id: "u-host" }], moim_members: [{ nickname: "Kim", joined_at: "t1" }] }), "m2", "u-new", "");
    await notifyMoimMemberJoined(fakeSb({ moims: [{ host_user_id: "u-host" }], moim_members: [{ nickname: "Kim", joined_at: "t9" }] }), "m1", "u-new", "");
    const keys = appendCalls.map((c) => c.dedupe_key);
    expect(new Set(keys).size).toBe(3);
  });

  it("B2 모임장 본인 가입(개설)은 알림 없음", async () => {
    await notifyMoimMemberJoined(fakeSb({ moims: [{ host_user_id: "u-host" }] }), "m1", "u-host", "x");
    expect(appendCalls).toHaveLength(0);
  });

  it("B3 가입 신청 → 승인권자에게 moim_join_requested (가입·초대 수락 공용)", async () => {
    await notifyMoimJoinRequested(fakeSb({}), "m1", "req-1", "Lee");
    expect(listMoimActorsFor).toHaveBeenCalledWith(expect.anything(), "m1", "decide_join");
    expect(appendCalls[0]).toMatchObject({ user_id: "u-decider", link_url: "/moim/m1/manage/requests", dedupe_key: "moim:moim_join_requested:req-1:u-decider" });
  });
});
