import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MoimReceivedInviteDto, MoimScheduleDto } from "@/lib/moim/moim-api-types";

/**
 * 모임 R3 묶음 A — 화면·CTA (설계 docs/audit/moim-r3-screens-design-2026-11-28.md §1-1·1-4·1-5·1-6).
 * 문자열 대조가 아니라 렌더 결과·순수 함수·라우트 동작을 본다(대감사 R5).
 */

const { g, inviteRespond } = vi.hoisted(() => ({
  g: { ok: true as const, userId: "u-me", sb: {} as unknown },
  inviteRespond: vi.fn<(...a: unknown[]) => Promise<Record<string, unknown>>>(async () => ({ ok: true, status: "pending", moim_id: "m1" })),
}));

vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return { ...actual, guardMoimWrite: async () => g, guardMoimAcceptGate: async () => null };
});
vi.mock("@/lib/moim/server/moim-rpc.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-rpc.server")>("@/lib/moim/server/moim-rpc.server");
  return { ...actual, moimInviteRespond: (...a: unknown[]) => inviteRespond(...a) };
});
vi.mock("@/lib/auth/require-registration-for-action.server", () => ({ requireRegistrationForAction: async () => null }));
/** R5 B5: 초대 수락 분기는 라우트가 약관을 확인한다(거절은 동의 예외) — 이 시험은 약관 통과로 둔다 */
vi.mock("@/lib/auth/require-signup-complete-api", () => ({ requireSignupCompleteForUser: async () => ({ ok: true }) }));
vi.mock("@/lib/moim/server/moim-notify.server", () => ({
  notifyMoimAfterResponse: () => undefined,
  notifyMoimJoinRequested: async () => undefined,
  notifyMoimMemberJoined: async () => undefined,
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));

import { moimCls, MoimRoleBadge } from "@/components/moim/moim-ui";
import {
  MOIM_SCHEDULE_STATUS_TONE,
  MoimScheduleMyBadge,
  MoimScheduleStatusBadge,
  moimScheduleCardBadge,
  moimScheduleDisplayStatus,
} from "@/components/moim/moim-schedule-ui";
import { MOIM_REPORT_SHEET_TARGET_TYPES, inMoimSheet } from "@/components/moim/MoimReportSheet";
import { moimInviteAcceptPayload } from "@/components/moim/MoimInvitesScreen";
import { moimCommentSection } from "@/components/moim/MoimPostDetailScreen";
import { moimMemberSheetItems } from "@/components/moim/MoimMemberView";
import { MoimNoticeBadge } from "@/components/moim/MoimPostRow";

const ko = (k: Parameters<typeof translate>[1]) => translate("ko", k);
/** 언어 공급자 없이 그리면 기본 언어(en) — 렌더 결과는 en 문구로 본다 */
const en = (k: Parameters<typeof translate>[1]) => translate("en", k);
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const NOW = Date.parse("2026-11-28T10:00:00Z");
const sched = (over: Partial<MoimScheduleDto>): Pick<MoimScheduleDto, "status" | "startsAt" | "viewer"> => ({
  status: "recruiting",
  startsAt: "2026-11-28T09:00:00Z",
  viewer: { status: null } as MoimScheduleDto["viewer"],
  ...over,
});

describe("R3 U-03 일정 상태 배지 — 시작한 일정은 「진행 중」", () => {
  it("시작했고 recruiting·full·closed 이면 started, 시작 전이면 상태 그대로", () => {
    for (const status of ["recruiting", "full", "closed"] as const) {
      expect(moimScheduleDisplayStatus({ status, startsAt: "2026-11-28T09:00:00Z" }, NOW)).toBe("started");
      expect(moimScheduleDisplayStatus({ status, startsAt: "2026-11-28T11:00:00Z" }, NOW)).toBe(status);
    }
    expect(moimScheduleDisplayStatus({ status: "done", startsAt: "2026-11-28T09:00:00Z" }, NOW)).toBe("done");
    expect(moimScheduleDisplayStatus({ status: "cancelled", startsAt: "2026-11-28T09:00:00Z" }, NOW)).toBe("cancelled");
  });

  it("렌더: 진행 중 문구(ko·en 키), 모집 중은 gray, 확정은 success(badgeOk)", () => {
    const started = html(createElement(MoimScheduleStatusBadge, { status: moimScheduleDisplayStatus({ status: "recruiting", startsAt: "2026-11-28T09:00:00Z" }, NOW) }));
    expect(started).toContain(en("moim_schedule_status_started_badge"));
    expect(ko("moim_schedule_status_started_badge")).toBe("진행 중");
    expect(translate("en", "moim_schedule_status_started_badge")).not.toMatch(/[가-힣]/);
    const recruiting = html(createElement(MoimScheduleStatusBadge, { status: "recruiting" }));
    expect(recruiting).toContain(moimCls.badgeGray);
    expect(recruiting).not.toContain(moimCls.badgeGreen);
    expect(MOIM_SCHEDULE_STATUS_TONE.recruiting).toBe(moimCls.badgeGray);
    const mine = html(createElement(MoimScheduleMyBadge, { status: "confirmed" }));
    expect(mine).toContain(moimCls.badgeOk);
    expect(mine).toContain(en("moim_schedule_my_confirmed_badge").replace("'", "&#x27;"));
  });
});

describe("R3 U-03 일정 카드 — 오른쪽 배지 1개", () => {
  it("내가 확정이면 「참여 확정」만, 아니면 상태(시작했으면 진행 중)", () => {
    expect(moimScheduleCardBadge(sched({ viewer: { status: "confirmed" } as MoimScheduleDto["viewer"] }), NOW)).toEqual({ kind: "my_confirmed" });
    expect(moimScheduleCardBadge(sched({ viewer: { status: "requested" } as MoimScheduleDto["viewer"] }), NOW)).toEqual({ kind: "status", status: "started" });
    expect(moimScheduleCardBadge(sched({ startsAt: "2026-11-29T09:00:00Z" }), NOW)).toEqual({ kind: "status", status: "recruiting" });
    /** 재감사 P2: 취소·종료된 일정은 참여 기록이 confirmed 여도 상태 배지가 먼저 */
    expect(moimScheduleCardBadge(sched({ status: "cancelled", viewer: { status: "confirmed" } as MoimScheduleDto["viewer"] }), NOW)).toEqual({
      kind: "status",
      status: "cancelled",
    });
    expect(moimScheduleCardBadge(sched({ status: "done", viewer: { status: "confirmed" } as MoimScheduleDto["viewer"] }), NOW)).toEqual({
      kind: "status",
      status: "done",
    });
  });
});

describe("R3 W6 신고 대상에 일정", () => {
  it("시트 대상 타입에 schedule 이 있고, 서버 허용 목록 안에 있다", async () => {
    expect(MOIM_REPORT_SHEET_TARGET_TYPES).toContain("schedule");
    const { MOIM_REPORT_TARGET_TYPES } = await vi.importActual<typeof import("@/lib/moim/server/moim-rpc.server")>("@/lib/moim/server/moim-rpc.server");
    for (const type of MOIM_REPORT_SHEET_TARGET_TYPES) expect(MOIM_REPORT_TARGET_TYPES as readonly string[]).toContain(type);
  });
});

describe("R3 U-08 역할 배지 — 모임장 primary · 부모임장·운영진 gray · pill", () => {
  it("렌더 결과의 색·모양", () => {
    const host = html(createElement(MoimRoleBadge, { role: "host" }));
    expect(host).toContain(moimCls.badgeGreen);
    expect(host).toContain("rounded-full");
    for (const role of ["co_host", "staff"] as const) {
      const out = html(createElement(MoimRoleBadge, { role }));
      expect(out, role).toContain(moimCls.badgeGray);
      expect(out, role).not.toContain(moimCls.badgeGreen);
      expect(out, role).toContain("rounded-full");
    }
    expect(html(createElement(MoimRoleBadge, { role: "member" }))).toBe("");
  });

  it("「공지」 배지는 warn 한 벌", () => {
    const out = html(createElement(MoimNoticeBadge));
    expect(out).toContain(moimCls.badgeWarn);
    expect(out).toContain(en("moim_post_pinned_badge"));
  });
});

describe("R3 U-04 ① · G-dng-08 멤버 탭 시트", () => {
  it("「대화하기」 → 「신고」 순서, 둘 다 일반 줄(빨강 아님), 각 동작에 상대 id", () => {
    const onMessage = vi.fn();
    const onReport = vi.fn();
    const items = moimMemberSheetItems({ userId: "u2" }, { t: ko, onMessage, onReport });
    expect(items.map((x) => x.key)).toEqual(["message", "report"]);
    expect(items.map((x) => x.label)).toEqual([ko("moim_manage_action_message"), ko("moim_menu_report")]);
    expect(items.every((x) => !x.danger)).toBe(true);
    items[0]!.onClick();
    items[1]!.onClick();
    expect(onMessage).toHaveBeenCalledWith("u2");
    expect(onReport).toHaveBeenCalledWith("u2");
  });
});

describe("R3 U-05 비회원 댓글 (D-35)", () => {
  it("비회원 = 목록과 같은 commentCount + 「멤버만」 안내, 멤버 = 받은 댓글 수", () => {
    expect(moimCommentSection(false, { commentCount: 4 }, 0)).toEqual({ count: 4, note: "members_only" });
    expect(moimCommentSection(true, { commentCount: 4 }, 4)).toEqual({ count: 4, note: null });
    expect(moimCommentSection(true, { commentCount: 0 }, 0)).toEqual({ count: 0, note: "empty" });
    expect(translate("en", "moim_comments_members_only")).not.toMatch(/[가-힣]/);
  });
});

describe("R3 U-07 시트 안 12px", () => {
  it("화면 4px 클래스를 오버레이 반경으로 바꾼다", () => {
    const out = inMoimSheet(moimCls.btnPrimary);
    expect(out).toContain("rounded-[length:var(--overlay-radius-md)]");
    expect(out.split(" ")).not.toContain("rounded-ui-rect");
  });
});

describe("R3 U-13 초대 수락 — 가입 질문 답 전달", () => {
  beforeEach(() => {
    inviteRespond.mockClear();
  });

  it("화면 본문: 질문이 있는 초대만 answers 를 넣는다", () => {
    const v = { answers: ["1년"], nickname: "민지", bio: "" };
    expect(moimInviteAcceptPayload({ joinQuestions: ["얼마나?"] }, v)).toEqual({ nickname: "민지", bio: "", answers: ["1년"] });
    expect(moimInviteAcceptPayload({ joinQuestions: [] }, v)).toEqual({ nickname: "민지", bio: "" });
  });

  it("client respondInvite → 요청 본문에 answers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: "pending" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { moimApi } = await import("@/lib/moim/moim-client-api");
      await moimApi.respondInvite("inv-1", true, { nickname: "민지", bio: "", answers: ["1년"] });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/api/moim/invites/inv-1");
      expect(JSON.parse(String(init.body))).toEqual({ accept: true, nickname: "민지", bio: "", answers: ["1년"] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("route → moimInviteRespond profile.answers (거절이면 answers 를 넘기지 않음)", async () => {
    const { POST } = await import("@/app/api/moim/invites/[inviteId]/route");
    const ID = "33333333-3333-4333-8333-333333333333";
    const req = (body: unknown) =>
      new Request(`http://x/api/moim/invites/${ID}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    await POST(req({ accept: true, nickname: "민지", answers: ["1년", 7] }) as never, { params: Promise.resolve({ inviteId: ID }) });
    expect(inviteRespond.mock.calls[0]?.[3]).toEqual({ nickname: "민지", avatarUrl: undefined, bio: undefined, answers: ["1년", ""] });
    await POST(req({ accept: false, answers: ["x"] }) as never, { params: Promise.resolve({ inviteId: ID }) });
    expect(inviteRespond.mock.calls[1]?.[3]).not.toHaveProperty("answers");
  });

  it("RPC 래퍼: p.answers 로 moim_invite_respond 에 넘긴다(없으면 키 없음)", async () => {
    const { moimInviteRespond } = await vi.importActual<typeof import("@/lib/moim/server/moim-rpc.server")>("@/lib/moim/server/moim-rpc.server");
    const rpc = vi.fn(async () => ({ data: { ok: true, status: "pending" }, error: null }));
    await moimInviteRespond("u1", "inv", true, { nickname: "민지", answers: ["1년"] }, { rpc } as never);
    expect(rpc).toHaveBeenCalledWith("moim_invite_respond", {
      p_actor: "u1",
      p_invite_target: "inv",
      p_accept: true,
      p: { nickname: "민지", answers: ["1년"] },
    });
    await moimInviteRespond("u1", "inv", true, { nickname: "민지" }, { rpc } as never);
    expect((rpc.mock.calls[1] as unknown as [string, { p: Record<string, unknown> }])[1].p).toEqual({ nickname: "민지" });
  });

  it("받은 초대 목록: 승인제 + 초대한 사람이 운영진 미만일 때만 질문을 채운다(질문 조회 1회)", async () => {
    const { listReceivedMoimInvites } = await vi.importActual<typeof import("@/lib/moim/server/moim-queries.server")>(
      "@/lib/moim/server/moim-queries.server"
    );
    const calls: string[] = [];
    const tables: Record<string, unknown[]> = {
      moim_invite_targets: [
        { id: "i1", moim_id: "m1", inviter_id: "a", created_at: "3" },
        { id: "i2", moim_id: "m2", inviter_id: "b", created_at: "2" },
        { id: "i3", moim_id: "m3", inviter_id: "c", created_at: "1" },
      ],
      moims: [
        ["m1", "approval"],
        ["m2", "approval"],
        ["m3", "instant"],
      ].map(([id, join_mode]) => ({ id, name: id, intro: "", category_id: "c1", lgu_id: "1381300000", join_mode, capacity: null, host_user_id: "h", status: "active", platform_state: "normal", member_count: 1, last_activity_at: "", main_room_id: null, created_at: "", updated_at: "", retention_ended_at: null })),
      moim_members: [
        { moim_id: "m1", user_id: "a", nickname: "A", role: "member", status: "active" },
        { moim_id: "m2", user_id: "b", nickname: "B", role: "staff", status: "active" },
        { moim_id: "m3", user_id: "c", nickname: "C", role: "member", status: "active" },
      ],
      moim_join_questions: [
        { moim_id: "m1", question: "Q2", sort_order: 2 },
        { moim_id: "m1", question: "Q1", sort_order: 1 },
      ],
    };
    const sb = {
      from(table: string) {
        calls.push(table);
        let rows = (tables[table] ?? []) as Record<string, unknown>[];
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "is", "or", "not", "order", "limit", "lt", "gt", "gte", "neq"]) chain[m] = () => chain;
        /** eq·in 은 실제로 거른다 (R5 B14 — 보는 사람의 멤버 상태로 초대를 거르므로 가짜도 user_id 조건을 지킨다) */
        chain.eq = (col: string, v: unknown) => ((rows = rows.filter((r) => !(col in r) || r[col] === v)), chain);
        chain.in = (col: string, vs: unknown[]) => ((rows = rows.filter((r) => !(col in r) || vs.includes(r[col]))), chain);
        chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
        chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
        return chain;
      },
    };
    const out: MoimReceivedInviteDto[] = await listReceivedMoimInvites(sb as never, "me");
    const byId = Object.fromEntries(out.map((x) => [x.id, x.joinQuestions]));
    expect(byId).toEqual({ i1: ["Q1", "Q2"], i2: [], i3: [] });
    expect(calls.filter((t) => t === "moim_join_questions")).toHaveLength(1);
  });
});
