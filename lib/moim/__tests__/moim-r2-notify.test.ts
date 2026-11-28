import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 R2 — 알림 공용 모듈 동작 (설계 docs/audit/moim-r2-notifications-design-2026-11-28.md §3-2)
 * N-08a 행위자 차단 일괄 거르기 · N-08b 설정 조회 실패 · N-08c 이름 대체 · keyVars 언어 변환 · U9-02 시각 · N-04 종료·삭제.
 */

const appendCalls: Array<Record<string, unknown>> = [];
const appendUserNotification = vi.fn(async (_sb: unknown, row: Record<string, unknown>) => {
  appendCalls.push(row);
  return true;
});
const loadOne = vi.fn(async () => "ko" as const);
const loadMany = vi.fn(async (_sb: unknown, ids: string[]) => new Map(ids.map((id) => [id, id.startsWith("en") ? ("en" as const) : ("ko" as const)])));
const listBlocked = vi.fn<(actor: string, ids: string[]) => Promise<Set<string> | null>>(async () => new Set());
const listMoimActorsFor = vi.fn(async () => ["u-decider"]);

vi.mock("@/lib/notifications/append-user-notification", () => ({
  appendUserNotification: (...a: [unknown, Record<string, unknown>]) => appendUserNotification(...a),
}));
vi.mock("@/lib/notifications/notification-user-language", () => ({
  loadNotificationUserLanguage: (...a: unknown[]) => loadOne(...(a as [])),
  loadNotificationUserLanguages: (...a: [unknown, string[]]) => loadMany(...a),
}));
vi.mock("@/lib/community-messenger/social-relations", () => ({
  listBlockedEitherWayAmong: (actor: string, ids: string[]) => listBlocked(actor, ids),
}));
vi.mock("@/lib/moim/server/moim-queries.server", () => ({
  listMoimActorsFor: (...a: unknown[]) => listMoimActorsFor(...(a as [])),
  loadMoimName: async () => "Moim",
}));

import {
  formatMoimNotifyTime,
  moimNotifyStartParts,
  notifyMoimClosedOrDeleted,
  notifyMoimJoinRequested,
  notifyMoimMany,
  readMoimRecipientsByPref,
  filterMoimRecipientsByPref,
} from "@/lib/moim/server/moim-notify.server";
import { isMoimNotificationReadTargetPath } from "@/lib/moim/moim-notification-read-target";

const base = { moimId: "m1", linkUrl: "/moim/m1", dedupeRef: "r1", vars: { moim: "Moim" } };

function prefsSb(results: Array<{ data: unknown[] | null; error: unknown }>) {
  let i = 0;
  return {
    from() {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.in = async () => results[Math.min(i++, results.length - 1)];
      return chain;
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  appendCalls.length = 0;
});

describe("N-08a 행위자 차단 관계 (사람이 한 활동 알림)", () => {
  it("차단 관계인 받는 사람은 한 번에 걸러 보내지 않는다 — 조회 1회, 저장소의 사람별 확인(sender_id) 없음", async () => {
    listBlocked.mockResolvedValueOnce(new Set(["u2"]));
    await notifyMoimMany({} as never, ["u1", "u2", "u3"], { ...base, kind: "moim_notice_posted", actorId: "author" });
    expect(listBlocked).toHaveBeenCalledTimes(1);
    expect(appendCalls.map((c) => c.user_id).sort()).toEqual(["u1", "u3"]);
    expect(appendCalls.every((c) => !("sender_id" in c))).toBe(true);
  });

  it("행위자 본인은 받는 사람에서 빠진다", async () => {
    await notifyMoimMany({} as never, ["author", "u1"], { ...base, kind: "moim_comment", actorId: "author" });
    expect(appendCalls.map((c) => c.user_id)).toEqual(["u1"]);
  });

  it("일괄 조회가 실패하면 저장소가 사람마다 확인하도록 sender_id 를 넣는다", async () => {
    listBlocked.mockResolvedValueOnce(null);
    await notifyMoimMany({} as never, ["u1"], { ...base, kind: "moim_invited", actorId: "inviter" });
    expect(appendCalls[0]).toMatchObject({ user_id: "u1", sender_id: "inviter" });
  });

  it("결과·필수 알림(행위자 없음)은 차단 조회를 하지 않는다", async () => {
    await notifyMoimMany({} as never, ["u1"], { ...base, kind: "moim_member_removed" });
    expect(listBlocked).not.toHaveBeenCalled();
    expect(appendCalls).toHaveLength(1);
  });
});

describe("keyVars — 문구 키 치환값을 받는 사람 언어로 (역할·콘텐츠 종류)", () => {
  it("한국어·영어 받는 사람에게 각자 언어 역할 이름, meta 에는 키 저장", async () => {
    await notifyMoimMany({} as never, ["ko1", "en1"], { ...base, kind: "moim_role_changed", keyVars: { role: "moim_role_member" } });
    const ko = appendCalls.find((c) => c.user_id === "ko1")!;
    const en = appendCalls.find((c) => c.user_id === "en1")!;
    expect(ko.body).toBe("Moim 내 역할: 멤버");
    expect(en.body).toBe("Your role in Moim: Member");
    expect((ko.meta as Record<string, unknown>).varKeys).toEqual({ role: "moim_role_member" });
  });
});

describe("N-08b 모임별 설정 조회 실패", () => {
  it("두 번 다 실패하면 null(리마인드) / 빈 목록(글·일정) — 끈 사람에게 보내지 않는다", async () => {
    const fail = { data: null, error: { message: "x" } };
    expect(await readMoimRecipientsByPref(prefsSb([fail, fail]), "m1", ["u1"], "notice")).toBeNull();
    expect(await filterMoimRecipientsByPref(prefsSb([fail, fail]), "m1", ["u1"], "notice")).toEqual([]);
  });

  it("한 번 실패 뒤 성공하면 설정대로 (행 없으면 기본값: 공지 켜짐·새 글 꺼짐)", async () => {
    const ok = { data: [{ user_id: "u2", notice: false, posts: true, schedules: true }], error: null };
    const fail = { data: null, error: { message: "x" } };
    expect(await readMoimRecipientsByPref(prefsSb([fail, ok]), "m1", ["u1", "u2"], "notice")).toEqual(["u1"]);
    expect(await readMoimRecipientsByPref(prefsSb([ok]), "m1", ["u1", "u2"], "posts")).toEqual(["u2"]);
  });
});

describe("N-08c 가입 신청 이름", () => {
  it("이름이 비면 대체 이름 키(받는 사람 언어) — 「님이」만 남지 않는다", async () => {
    await notifyMoimJoinRequested({} as never, "m1", "req1", "  ", "applicant");
    expect(appendCalls[0].body).toBe("회원님이 Moim에 가입을 신청했어요");
    expect(listBlocked).toHaveBeenCalledWith("applicant", ["u-decider"]);
  });
});

describe("U9-02 리마인드 시각 (필리핀 시간)", () => {
  const now = new Date("2026-11-28T02:00:00Z"); // 10:00 PHT
  it("같은 날이면 today, 다음 날이면 tomorrow", () => {
    expect(moimNotifyStartParts("2026-11-28T10:00:00Z", now)).toEqual({ day: "today", hour: 18, minute: 0 });
    expect(moimNotifyStartParts("2026-11-28T17:30:00Z", now)).toEqual({ day: "tomorrow", hour: 1, minute: 30 });
  });
  it("ko 「오후 6시」 · en 「6 PM」, 분이 있으면 붙인다", () => {
    expect(formatMoimNotifyTime("ko", 18, 0)).toBe("오후 6시");
    expect(formatMoimNotifyTime("ko", 9, 30)).toBe("오전 9시 30분");
    expect(formatMoimNotifyTime("ko", 9, 5)).toBe("오전 9시 05분");
    expect(formatMoimNotifyTime("en", 18, 0)).toBe("6 PM");
    expect(formatMoimNotifyTime("en", 0, 5)).toBe("12:05 AM");
  });
  it("varsForLang 로 받는 사람마다 시각 문구를 만든다 (시안 U9 「내일 오후 6시에 시작해요」)", async () => {
    await notifyMoimMany({} as never, ["ko1", "en1"], {
      ...base,
      kind: "moim_schedule_reminder_24h",
      variant: "tomorrow",
      vars: { title: "토요일 정기 게임" },
      varsForLang: (lang) => ({ time: formatMoimNotifyTime(lang, 18, 0) }),
    });
    expect(appendCalls.find((c) => c.user_id === "ko1")!.body).toBe("토요일 정기 게임 일정이 내일 오후 6시에 시작해요");
    expect(appendCalls.find((c) => c.user_id === "en1")!.body).toBe("토요일 정기 게임 starts tomorrow at 6 PM");
  });
});

describe("N-04 종료·어드민 삭제", () => {
  const r = { name: "Moim", notify_user_ids: ["host", "u1"], cancelled_schedules: [{ schedule_id: "s1", title: "T", user_ids: ["host", "u2"] }] };
  it("종료: 모임장(행위자) 제외, 확정 참여자에게 일정 취소", async () => {
    await notifyMoimClosedOrDeleted({} as never, "m1", r, { kind: "closed", actorId: "host" });
    expect(appendCalls.map((c) => `${(c.meta as Record<string, unknown>).kind}:${c.user_id}`)).toEqual(["moim_closed:u1", "moim_schedule_cancelled:u2"]);
    expect(appendCalls[0].link_url).toBe("/moim/m1");
  });
  it("어드민 삭제: 모임장도 받고, 이동은 모임 탭(모임 페이지는 404 · D-24), 문구 갈래 admin_deleted", async () => {
    await notifyMoimClosedOrDeleted({} as never, "m1", r, { kind: "admin_deleted" });
    const closed = appendCalls.filter((c) => (c.meta as Record<string, unknown>).kind === "moim_closed");
    expect(closed.map((c) => c.user_id).sort()).toEqual(["host", "u1"]);
    expect(closed[0].link_url).toBe("/moim");
    expect(closed[0].title).toBe("모임 삭제");
  });
});

describe("N-06 읽음 목적지 경로 = 알림 link_url 형식만", () => {
  const M = "11111111-1111-4111-8111-111111111111";
  const P = "22222222-2222-4222-8222-222222222222";
  it.each(["/moim", "/moim/invites", `/moim/${M}`, `/moim/${M}/posts/${P}`, `/moim/${M}/schedules/${P}`, `/moim/${M}/manage/requests`, `/moim/${M}/manage/members`])(
    "허용 %s",
    (p) => expect(isMoimNotificationReadTargetPath(p)).toBe(true)
  );
  it.each(["/moim/x", `/moim/${M}/manage/reports`, `/community/${M}`, `/moim/${M}/posts/${P}?x=1`, `/moim/${M}/`])("거부 %s", (p) =>
    expect(isMoimNotificationReadTargetPath(p)).toBe(false)
  );
});

describe("재감사 F1 — 모임 알림 이동 위치가 저장 때 대체 주소로 바뀌지 않는다 (실제 저장 경로)", async () => {
  const { resolveSafeNotificationInternalRoute } = await vi.importActual<typeof import("@/lib/notifications/policy/notification-internal-route")>(
    "@/lib/notifications/policy/notification-internal-route"
  );
  const { finalizeNotificationEventRoute } = await vi.importActual<typeof import("@/lib/notifications/core/notification-event-final-route")>(
    "@/lib/notifications/core/notification-event-final-route"
  );
  const M = "11111111-1111-4111-8111-111111111111";
  const P = "22222222-2222-4222-8222-222222222222";
  it.each(["/moim", "/moim/invites", `/moim/${M}`, `/moim/${M}/posts/${P}`, `/moim/${M}/schedules/${P}`, `/moim/${M}/manage/requests`])("허용 %s", (p) =>
    expect(resolveSafeNotificationInternalRoute(p, "/fallback")).toBe(p)
  );
  it("저장 직전 최종 목적지(display_payload.routeUrl) = 모임 링크 그대로", () => {
    const { displayPayload } = finalizeNotificationEventRoute({
      userId: "u1",
      type: "community_activity",
      category: "community_activity",
      title: "t",
      body: "b",
      dedupeKey: "k",
      displayPayload: { routeUrl: `/moim/${M}/posts/${P}`, legacyMeta: { kind: "moim_comment" } },
    } as never);
    expect(displayPayload.routeUrl).toBe(`/moim/${M}/posts/${P}`);
  });
});
