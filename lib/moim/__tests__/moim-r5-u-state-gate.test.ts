import { describe, expect, it } from "vitest";
import type { MoimDetailDto, MoimMyContentItemDto, MoimScheduleDto, MoimCardDto, MoimBoardDto } from "@/lib/moim/moim-api-types";
import { MOIM_ACTIONS, type MoimAction } from "@/lib/moim/moim-permission-contract";
import {
  MOIM_JOIN_ANSWER_MAX,
  MOIM_TRANSFER_STALE_ERRORS,
  moimAfterLeaveHref,
  moimHostTransferGate,
  moimManageBlockReason,
  moimPostGate,
  moimReadOnlyReason,
  moimScheduleGate,
  readMoimJoinAnswers,
} from "@/lib/moim/moim-state-gate";
import { isoToPhtInputs, phtInputsToIso } from "@/lib/time/pht-input";
import { arrangeMoimMine } from "@/components/moim/MoimCard";
import { defaultMoimWriteBoard } from "@/components/moim/MoimMemberView";
import { moimLocalEmptyKey } from "@/components/moim/MoimTabHome";
import { moimMyContentBadges, moimMyContentHref } from "@/components/moim/MoimMyContentScreen";
import { moimShowsMyContentLink } from "@/components/moim/MoimPublicView";
import { canOpenMoimManageHub, moimCanEditMemberNote, moimManageForbiddenKeys, moimRoleAtLeastLabel } from "@/components/moim/manage/moim-manage-shared";
import { moimRequestsBackHref } from "@/components/moim/manage/MoimManageRequests";
import { moimInviteFriendState, moimInviteRowErrorKey } from "@/components/moim/manage/MoimManageInvite";
import { moimStaffReportOutcome } from "@/components/moim/manage/MoimManageReports";
import { moveMoimBoardOrder, splitMoimBoards } from "@/components/moim/manage/MoimManageBoards";
import { isMoimScheduleRequestGone, moimScheduleRequestErrorKey } from "@/components/moim/MoimScheduleDetailScreen";
import { moimBirthYearRangeError } from "@/components/moim/manage/MoimManageInfo";
import { moimCloseDoneAlert } from "@/components/moim/manage/MoimManageClose";

/**
 * 모임 R5 U — 사용자·운영 관리 화면 동작 판정 (설계 docs/audit/moim-r5-design-2026-11-28/BC-user-manage.md · INTEGRATED §C).
 * 고치기 전 화면은 상태를 따로 판단해 종료·차단 모임에 댓글 칸·수정·수락 버튼을 그렸다 — 여기서는 판정 함수를 직접 시험한다.
 */

function can(on: Partial<Record<MoimAction, boolean>> = {}): Record<MoimAction, boolean> {
  return Object.fromEntries(MOIM_ACTIONS.map((a) => [a, on[a] === true])) as Record<MoimAction, boolean>;
}

function moim(over: Partial<Omit<MoimDetailDto, "viewer">> & { viewer?: Partial<MoimDetailDto["viewer"]> } = {}): MoimDetailDto {
  const { viewer, ...rest } = over;
  return {
    id: "m1",
    name: "M",
    intro: "",
    coverImageUrl: null,
    category: null,
    topicLabel: null,
    cityLabel: null,
    joinMode: "instant",
    capacity: null,
    memberCount: 3,
    ageMinBirthYear: null,
    ageMaxBirthYear: null,
    status: "active",
    platformState: "normal",
    createdAt: "",
    updatedAt: "",
    lastActivityAt: "",
    host: null,
    joinQuestions: [],
    boards: [],
    pinnedNotices: [],
    recentPosts: [],
    upcomingSchedules: [],
    closedRetentionDays: null,
    can: can(),
    permissionOverrides: {},
    ...rest,
    viewer: {
      loggedIn: true,
      status: "active",
      role: "member",
      nickname: "me",
      avatarUrl: null,
      bio: null,
      pendingRequestId: null,
      banned: false,
      incomingHostTransferId: null,
      outgoingHostTransfer: null,
      roomId: null,
      ...(viewer ?? {}),
    },
  };
}

const myPost = { viewerIsAuthor: true, boardKind: "free" as const };
const otherPost = { viewerIsAuthor: false, boardKind: "free" as const };

describe("R-A 글 상세 (B2·B17)", () => {
  it.each([
    ["closed", { status: "closed" as const }],
    ["blocked", { platformState: "blocked" as const }],
  ])("%s 모임: 작성자도 댓글·수정 없음, 삭제는 남음, 하단 = 상태 안내", (_n, over) => {
    const g = moimPostGate(moim(over), myPost, true);
    expect(g).toMatchObject({ canComment: false, canEdit: false, canDelete: true, footer: "readonly" });
  });

  it("활동 모임 멤버 작성자: 댓글·수정·삭제 · 하단 = 입력칸", () => {
    expect(moimPostGate(moim(), myPost, true)).toMatchObject({ canComment: true, canEdit: true, canDelete: true, footer: "composer" });
  });

  it("공지 글 수정은 공지 권한(pin_notice)이 있어야 한다", () => {
    const notice = { viewerIsAuthor: true, boardKind: "notice" as const };
    expect(moimPostGate(moim(), notice, true).canEdit).toBe(false);
    expect(moimPostGate(moim({ can: can({ pin_notice: true }) }), notice, true).canEdit).toBe(true);
  });

  it("비멤버 하단: 차단 → banned · 신청 중 → pending · 비로그인 → login · 그 밖 → join", () => {
    expect(moimPostGate(moim({ viewer: { status: "banned", banned: true } }), otherPost, false).footer).toBe("banned");
    expect(moimPostGate(moim({ viewer: { status: "pending", pendingRequestId: "r1" } }), otherPost, false).footer).toBe("pending");
    expect(moimPostGate(moim({ viewer: { loggedIn: false, status: null } }), otherPost, false).footer).toBe("login");
    expect(moimPostGate(moim({ viewer: { status: "left" } }), otherPost, false).footer).toBe("join");
  });

  it("숨기기는 남의 글 · 읽기 전용이 아니고 hide_post 가 있을 때만", () => {
    expect(moimPostGate(moim({ can: can({ hide_post: true }) }), otherPost, true).canHide).toBe(true);
    expect(moimPostGate(moim({ status: "closed", can: can({ hide_post: true }) }), otherPost, true).canHide).toBe(false);
    expect(moimPostGate(moim({ can: can({ hide_post: true }) }), myPost, true).canHide).toBe(false);
  });
});

function sched(over: Partial<Pick<MoimScheduleDto, "status" | "startsAt">> & { canManage?: boolean } = {}) {
  return {
    status: over.status ?? ("recruiting" as const),
    startsAt: over.startsAt ?? "2026-12-01T10:00:00.000Z",
    viewer: { status: null, isHost: false, canManage: over.canManage ?? true, roomId: null },
  };
}
const BEFORE = Date.parse("2026-12-01T09:00:00.000Z");
const AFTER = Date.parse("2026-12-01T10:01:00.000Z");

describe("R-A 일정 (B7·C6·C9)", () => {
  it("시작 1분 뒤: 수정·신청 결정·내보내기·마감 없음, 출석은 있음", () => {
    const g = moimScheduleGate(moim(), sched(), AFTER);
    expect(g).toMatchObject({ started: true, live: true, canEdit: false, canDecideRequests: false, canRemoveParticipant: false, canToggleClosed: false, canAttendance: true });
  });

  it("시작 전 관리권자: 수정·결정 가능", () => {
    expect(moimScheduleGate(moim(), sched(), BEFORE)).toMatchObject({ canEdit: true, canDecideRequests: true, canCancel: true });
  });

  it("취소 일정: 내 참여 배지 없음(「취소됨」만) · live 아님", () => {
    expect(moimScheduleGate(moim(), sched({ status: "cancelled" }), BEFORE)).toMatchObject({ showMyBadge: false, live: false, canEdit: false });
  });

  it("종료·차단 모임 일정: live 아님 → 수정·취소 없음", () => {
    for (const over of [{ status: "closed" as const }, { platformState: "blocked" as const }]) {
      expect(moimScheduleGate(moim(over), sched(), BEFORE)).toMatchObject({ live: false, canEdit: false, canCancel: false, canAttendance: false });
    }
  });
});

describe("R-A 위임 배너 (C7)", () => {
  it("경고·차단·종료 → 수락 없음 + 안내 키 · 일반·추천 제외 → 수락", () => {
    expect(moimHostTransferGate({ status: "active", platformState: "warned" })).toEqual({ canAccept: false, canDecline: true, blockedKey: "moim_transfer_banner_blocked" });
    expect(moimHostTransferGate({ status: "active", platformState: "blocked" }).canAccept).toBe(false);
    expect(moimHostTransferGate({ status: "closed", platformState: "normal" }).canAccept).toBe(false);
    expect(moimHostTransferGate({ status: "active", platformState: "normal" }).canAccept).toBe(true);
    expect(moimHostTransferGate({ status: "active", platformState: "unlisted" }).canAccept).toBe(true);
  });
  it("낡은 요청 오류는 다시 불러오기 대상", () => {
    for (const e of ["moim_transfer_not_found", "moim_transfer_stale", "moim_transfer_blocked_by_warning", "moim_blocked"]) expect(MOIM_TRANSFER_STALE_ERRORS.has(e)).toBe(true);
    expect(MOIM_TRANSFER_STALE_ERRORS.has("moim_unknown")).toBe(false);
  });
});

describe("R-A 나가기 뒤 이동 (B15) · 운영 틀 (C16)", () => {
  it("종료 모임에서 나가면 모임 탭, 활동 모임이면 다시 불러오기(null)", () => {
    expect(moimAfterLeaveHref({ status: "closed" }, "/moim")).toBe("/moim");
    expect(moimAfterLeaveHref({ status: "active" }, "/moim")).toBeNull();
  });
  it("운영 화면 막힘 이유: 종료 → closed · 차단 → blocked · 그 밖 null", () => {
    expect(moimManageBlockReason({ status: "closed", platformState: "normal" })).toBe("closed");
    expect(moimManageBlockReason({ status: "active", platformState: "blocked" })).toBe("blocked");
    expect(moimManageBlockReason({ status: "active", platformState: "warned" })).toBeNull();
    expect(moimReadOnlyReason(null)).toBeNull();
  });
});

describe("B11 가입 답 1,000자", () => {
  it("1,001자 답은 자르지 않고 too_long · 1,000자는 그대로", () => {
    expect(readMoimJoinAnswers(["a".repeat(MOIM_JOIN_ANSWER_MAX + 1)])).toBe("too_long");
    expect(readMoimJoinAnswers(["a".repeat(MOIM_JOIN_ANSWER_MAX)])).toEqual(["a".repeat(MOIM_JOIN_ANSWER_MAX)]);
    expect(readMoimJoinAnswers(undefined)).toBeUndefined();
    expect(readMoimJoinAnswers(["x", 3, "y", "z"])).toEqual(["x", "", "y"]);
  });
});

describe("B24 일정 입력 = 필리핀 시간 고정", () => {
  it("입력 7:00 PM(19:00) → 11:00Z, 되돌리면 같은 입력 (기기 시간대와 무관)", () => {
    const iso = phtInputsToIso("2026-12-05", "19:00");
    expect(iso).toBe("2026-12-05T11:00:00.000Z");
    expect(isoToPhtInputs(iso)).toEqual({ date: "2026-12-05", time: "19:00" });
  });
  it("자정을 넘는 시각도 PHT 날짜로", () => {
    expect(isoToPhtInputs("2026-12-05T17:30:00.000Z")).toEqual({ date: "2026-12-06", time: "01:30" });
  });
  it("없는 날짜·형식 오류는 null", () => {
    expect(phtInputsToIso("2026-02-30", "10:00")).toBeNull();
    expect(phtInputsToIso("2026-12-05", "7pm")).toBeNull();
    expect(isoToPhtInputs("bad")).toEqual({ date: "", time: "" });
  });
});

describe("B12 내 모임 줄 · B4 기본 게시판 · B20 빈 문구 · B1 내 글 줄", () => {
  const card = (id: string, viewerStatus: MoimCardDto["viewerStatus"]): MoimCardDto =>
    ({ id, viewerStatus, status: "active" }) as unknown as MoimCardDto;

  it("신청 중은 맨 뒤 · 개수에서 뺀다 (pending 1 + active 2 → 개수 2)", () => {
    const r = arrangeMoimMine([card("p", "pending"), card("a", "active"), card("b", "active")]);
    expect(r.items.map((x) => x.id)).toEqual(["a", "b", "p"]);
    expect(r.count).toBe(2);
  });

  it("기본 글쓰기 게시판 = 공지가 아닌 첫 게시판, 공지만 쓸 수 있으면 공지", () => {
    const b = (id: string, kind: MoimBoardDto["kind"], sortOrder: number, isActive = true): MoimBoardDto => ({ id, kind, name: null, writeMinRole: "member", sortOrder, isActive });
    const staff = moim({ can: can({ pin_notice: true }), viewer: { role: "staff" }, boards: [b("n", "notice", 1), b("f", "free", 2)] });
    expect(defaultMoimWriteBoard(staff)?.id).toBe("f");
    const onlyNotice = moim({ can: can({ pin_notice: true }), viewer: { role: "staff" }, boards: [b("n", "notice", 1), b("f", "free", 2, false)] });
    expect(defaultMoimWriteBoard(onlyNotice)?.id).toBe("n");
    /** R5 C15 위험 확인: 닫은 게시판만 있으면 글쓰기 후보 0 */
    const closedOnly = moim({ boards: [b("f", "free", 1, false)] });
    expect(defaultMoimWriteBoard(closedOnly)).toBeNull();
  });

  it("카테고리 0개면 「아직 우리 동네에 모임이 없어요」", () => {
    expect(moimLocalEmptyKey([])).toBe("moim_home_local_empty_preparing");
    expect(moimLocalEmptyKey(null)).toBe("moim_home_local_empty");
    expect(moimLocalEmptyKey([{ id: "c" } as never])).toBe("moim_home_local_empty");
  });

  it("내 글 줄: 활동 멤버 + 보이는 글만 이동 · 배지 = 숨겨짐·나간 모임·종료", () => {
    const item = (over: Partial<MoimMyContentItemDto>): MoimMyContentItemDto => ({
      id: "p1",
      type: "post",
      moimId: "m1",
      moimName: "M",
      moimStatus: "active",
      viewerIsActiveMember: true,
      status: "active",
      createdAt: "",
      ...over,
    });
    expect(moimMyContentHref(item({}))).toBe("/moim/m1/posts/p1");
    expect(moimMyContentHref(item({ status: "hidden" }))).toBeNull();
    expect(moimMyContentHref(item({ viewerIsActiveMember: false }))).toBeNull();
    expect(moimMyContentHref(item({ type: "comment", id: "c1", postId: "p9" }))).toBe("/moim/m1/posts/p9");
    expect(moimMyContentHref(item({ type: "album" }))).toBeNull();
    expect(moimMyContentBadges(item({ status: "hidden", viewerIsActiveMember: false }))).toEqual(["moim_my_content_hidden_badge", "moim_my_content_left_badge"]);
    expect(moimMyContentBadges(item({ moimStatus: "closed", viewerIsActiveMember: false }))).toEqual(["moim_card_closed_badge"]);
  });

  it("공개 페이지 링크: 나감·내보내짐·차단만 (가입한 적 없음·활동 멤버는 없음)", () => {
    for (const st of ["left", "kicked", "banned"] as const) expect(moimShowsMyContentLink(moim({ viewer: { status: st } }))).toBe(true);
    expect(moimShowsMyContentLink(moim({ viewer: { status: null } }))).toBe(false);
    expect(moimShowsMyContentLink(moim({ viewer: { status: "active" } }))).toBe(false);
    expect(moimShowsMyContentLink(moim({ viewer: { status: "left", loggedIn: false } }))).toBe(false);
  });
});

describe("R-D 운영 허브 판정 (C1·C22) · C12 · C13 · C16", () => {
  it("send_invite 만 가진 멤버는 허브를 못 연다 · hide_post 만 가진 운영진은 연다", () => {
    expect(canOpenMoimManageHub(moim({ can: can({ send_invite: true }) }))).toBe(false);
    expect(canOpenMoimManageHub(moim({ viewer: { role: "staff" }, can: can({ hide_post: true }) }))).toBe(true);
    /** 미접속 모임장 변경 요청(부모임장) 은 그대로 연다 */
    expect(canOpenMoimManageHub(moim({ viewer: { role: "co_host" } }))).toBe(true);
  });

  it("가입 신청 화면 뒤로: from=members 만 멤버 관리, 다른 값은 무시", () => {
    expect(moimRequestsBackHref("m1", "members")).toBe("/moim/m1/manage/members");
    expect(moimRequestsBackHref("m1", "https://evil.test")).toBeUndefined();
    expect(moimRequestsBackHref("m1", null)).toBeUndefined();
  });

  it("「{role} 이상」 → 모임장이면 「모임장만」", () => {
    const t = (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k);
    expect(moimRoleAtLeastLabel("host", t as never)).toBe("moim_manage_perm_host_only_chip");
    expect(moimRoleAtLeastLabel("host", t as never, "board_write")).toBe("moim_manage_board_write_role_host_only");
    expect(moimRoleAtLeastLabel("staff", t as never)).toContain("moim_manage_perm_role_or_above_chip");
  });

  it("메모 고치기: 나보다 낮은 역할의 다른 멤버만 (나 자신·같은·높은 역할은 보기만)", () => {
    const x = { canWriteNote: true, viewerRole: "staff" as const, myId: "me" };
    expect(moimCanEditMemberNote(x, { userId: "u", role: "member" })).toBe(true);
    expect(moimCanEditMemberNote(x, { userId: "u", role: "staff" })).toBe(false);
    expect(moimCanEditMemberNote(x, { userId: "u", role: "co_host" })).toBe(false);
    expect(moimCanEditMemberNote(x, { userId: "me", role: "member" })).toBe(false);
    expect(moimCanEditMemberNote({ ...x, canWriteNote: false }, { userId: "u", role: "member" })).toBe(false);
  });

  it("운영 화면 막힘 문구: 종료 · 차단 · 권한 없음", () => {
    expect(moimManageForbiddenKeys(moim({ status: "closed" }))).toEqual({ title: "moim_manage_closed_title", body: "moim_manage_closed_body" });
    expect(moimManageForbiddenKeys(moim({ platformState: "blocked" }))).toEqual({ title: "moim_manage_blocked_title", body: "moim_manage_blocked_body" });
    expect(moimManageForbiddenKeys(moim())).toEqual({ title: "moim_manage_forbidden_title", body: "moim_manage_forbidden_body" });
  });
});

describe("C2 초대 · C3 신고 처리 · C4 게시판 순서 · C8 일정 신청 · C17 연도 · C21 종료", () => {
  it("초대 실패 줄 = 보내는 사람 입장 문구", () => {
    expect(moimInviteRowErrorKey("moim_already_member")).toBe("moim_manage_invite_row_err_member");
    expect(moimInviteRowErrorKey("moim_already_pending")).toBe("moim_manage_invite_row_err_pending");
    expect(moimInviteRowErrorKey("moim_join_not_allowed")).toBe("moim_manage_invite_row_err_not_allowed");
    expect(moimInviteRowErrorKey("moim_invite_not_allowed")).toBe("moim_manage_invite_row_err_not_allowed");
    expect(moimInviteRowErrorKey("moim_rate_limited")).toBe("moim_err_moim_rate_limited");
    const check = { members: ["a"], unavailable: ["b"] };
    expect(moimInviteFriendState("a", check)).toBe("member");
    expect(moimInviteFriendState("b", check)).toBe("unavailable");
    expect(moimInviteFriendState("c", check)).toBe("ok");
    expect(moimInviteFriendState("a", null)).toBe("ok");
  });

  it("운영진 자기 글 신고 처리 결과 = 삭제됨 (응답 result 우선)", () => {
    expect(moimStaffReportOutcome({ targetType: "comment", viewerIsAuthor: true }, undefined)).toBe("deleted");
    expect(moimStaffReportOutcome({ targetType: "comment", viewerIsAuthor: false }, undefined)).toBe("hidden");
    expect(moimStaffReportOutcome({ targetType: "post", viewerIsAuthor: false }, "deleted")).toBe("deleted");
  });

  it("게시판 순서: 한 칸 옮기기 · 끝을 넘으면 그대로 · 켜진·닫은 게시판 나누기", () => {
    expect(moveMoimBoardOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveMoimBoardOrder(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveMoimBoardOrder(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    const b = (id: string, sortOrder: number, isActive: boolean): MoimBoardDto => ({ id, kind: "custom", name: id, writeMinRole: "member", sortOrder, isActive });
    const r = splitMoimBoards([b("x", 3, true), b("y", 1, false), b("z", 2, true)]);
    expect(r.active.map((x) => x.id)).toEqual(["z", "x"]);
    expect(r.closed.map((x) => x.id)).toEqual(["y"]);
  });

  it("일정 신청이 이미 처리됨: 새 코드·옛 코드 모두 일정 문구 (가입 신청 문구 아님)", () => {
    expect(moimScheduleRequestErrorKey("moim_schedule_request_not_found")).toBe("moim_err_moim_schedule_request_not_found");
    expect(moimScheduleRequestErrorKey("moim_request_not_found")).toBe("moim_err_moim_schedule_request_not_found");
    expect(moimScheduleRequestErrorKey("moim_forbidden")).toBe("moim_err_moim_forbidden");
    expect(isMoimScheduleRequestGone("moim_forbidden")).toBe(false);
  });

  it("출생 연도: 범위 오류와 순서 오류를 나눈다 · 올해 상한", () => {
    expect(moimBirthYearRangeError(1899, null, 2026)).toBe("moim_manage_info_age_year_invalid_toast");
    expect(moimBirthYearRangeError(null, 2027, 2026)).toBe("moim_manage_info_age_year_invalid_toast");
    expect(moimBirthYearRangeError("invalid", null, 2026)).toBe("moim_manage_info_age_year_invalid_toast");
    expect(moimBirthYearRangeError(2000, 1990, 2026)).toBe("moim_manage_info_age_order_invalid_toast");
    expect(moimBirthYearRangeError(1990, 2000, 2026)).toBeNull();
  });

  it("종료 완료 안내: 열람 기간이 있으면 본문(1일은 단수 키)", () => {
    const t = ((k: string, v?: Record<string, unknown>) => (v ? `${k}|${v.days}` : k)) as never;
    expect(moimCloseDoneAlert(t, 30)).toEqual({ title: "moim_manage_close_done_title", description: "moim_manage_close_done_body|30" });
    expect(moimCloseDoneAlert(t, 1).description).toBe("moim_manage_close_done_body_one|1");
    expect(moimCloseDoneAlert(t, null)).toEqual({ title: "moim_manage_close_done_title" });
  });
});
