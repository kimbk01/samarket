import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { translate } from "@/lib/i18n/messages";
import {
  buildRoomTimelineChipParts,
  resolveMoimRoomHeaderStatus,
  resolveMoimRoomNoticeRow,
  resolveMoimRoomSurface,
  resolveMoimRoomSurfaceFromView,
  resolveMoimScheduleListSubline,
  resolveRoomMemberSubtitle,
  resolveRoomReadonlyNotice,
  withMoimReadonlyReason,
} from "@/lib/moim/moim-room-surface-policy";
import { moimRoomOwnerShowsHome, type MoimRoomOwner } from "@/lib/moim/use-moim-room-owner";

/**
 * 모임 R5 A §1 — 모임 방 표면 규칙 하나 (docs/audit/moim-r5-design-2026-11-28/A-messenger-room.md §1·§3·§7-1).
 * 고치기 전에는 이 함수가 없었고, 화면마다 `vm.isPrivateGroupRoom ?`·`moimRoleOwner ? null : 배지` 같은 조건이 따로 있어
 * 판정 중(owner 없음)에는 메신저 관리 UI 를 그렸다(A1·A4·A7·A22).
 */

const moim = (over: Partial<MoimRoomOwner> = {}): MoimRoomOwner => ({
  moimId: "m1",
  kind: "moim",
  moimName: "BGC 배드민턴",
  moimStatus: "active",
  homeOpen: true,
  readonlyReason: null,
  scheduleStartsAt: null,
  memberRoles: { h: "host", c: "co_host", s: "staff" },
  canStartDm: true,
  ...over,
});

const surface = (owner: MoimRoomOwner | null, ownerStatus: "resolved" | "loading" | "failed" | "none" = "resolved", viewer = "u") =>
  resolveMoimRoomSurface({ roomType: "private_group", owner, ownerStatus, viewerUserId: viewer });

describe("판정 상태 3가지 (not_moim · moim · pending)", () => {
  it("비공개 그룹이 아니면 not_moim — 판정 중이어도 메신저 UI 그대로", () => {
    for (const roomType of ["open_group", "direct", null]) {
      const s = resolveMoimRoomSurface({ roomType, owner: null, ownerStatus: "loading", viewerUserId: "u" });
      expect(s.state).toBe("not_moim");
      expect(s.messengerManagement).toBe(true);
    }
  });

  it("비공개 그룹 + 답 받음 + owner 없음 = not_moim · owner 있음 = moim", () => {
    expect(surface(null).state).toBe("not_moim");
    expect(surface(moim()).state).toBe("moim");
  });

  it("비공개 그룹 + 판정 중·실패·아직 안 물음 = pending (Owner 결정 1 — 실패도 숨김)", () => {
    for (const st of ["loading", "failed", "none"] as const) {
      const s = surface(null, st);
      expect(s.state).toBe("pending");
      expect(s.messengerManagement).toBe(false);
    }
  });
});

describe("깃발 표 (A1~A7 · A17 · A20~A22)", () => {
  it("messengerManagement: not_moim=보임 · moim=숨김 · pending=숨김 (A1·A3·A4·A7·A17·A20)", () => {
    expect(surface(null).messengerManagement).toBe(true);
    expect(surface(moim()).messengerManagement).toBe(false);
    expect(surface(null, "failed").messengerManagement).toBe(false);
  });

  it("pending 이면 메신저 공지·역할 배지·[1:1] 모두 없음 (A22)", () => {
    const s = surface(null, "loading");
    expect(s.messengerManagement).toBe(false);
    expect(s.moimEntry).toBe(false);
    expect(s.startDirectChat).toBe(false);
    expect(s.viewerRoleKey).toBeNull();
    expect(s.hideViewerRole).toBe(true);
    expect(s.hideRoomType).toBe(true);
    expect(s.memberRoleKey("h")).toBeNull();
  });

  it("[1:1] = not_moim 보임 · moim 은 canStartDm · pending 숨김", () => {
    expect(surface(null).startDirectChat).toBe(true);
    expect(surface(moim({ canStartDm: true })).startDirectChat).toBe(true);
    expect(surface(moim({ canStartDm: false })).startDirectChat).toBe(false);
    expect(surface(moim({ canStartDm: undefined })).startDirectChat).toBe(false);
  });

  it("내 역할 = 모임 역할 (A2) — 부모임장 → 부모임장, 역할 맵에 없음 → 멤버", () => {
    expect(surface(moim(), "resolved", "c").viewerRoleKey).toBe("moim_role_co_host");
    expect(surface(moim(), "resolved", "h").viewerRoleKey).toBe("moim_role_host");
    expect(surface(moim(), "resolved", "s").viewerRoleKey).toBe("moim_role_staff");
    expect(surface(moim(), "resolved", "nobody").viewerRoleKey).toBe("moim_role_member");
    expect(translate("ko", surface(moim(), "resolved", "s").viewerRoleKey!)).toBe("운영진");
    expect(surface(null).viewerRoleKey).toBeNull();
  });

  it("방 종류 = 「모임 채팅방」/「일정 채팅방」 (A5·A6)", () => {
    expect(surface(moim()).roomTypeLabelKey).toBe("moim_room_type_moim");
    expect(surface(moim({ kind: "schedule", scheduleId: "s1" })).roomTypeLabelKey).toBe("moim_room_type_schedule");
    expect(translate("ko", "moim_room_type_moim")).toBe("모임 채팅방");
    expect(surface(null).roomTypeLabelKey).toBeNull();
  });

  it("안내 문구 4경우 (A21) — 모임·일정 + homeOpen / 삭제·열람 끝 / pending", () => {
    expect(surface(moim()).captionKey).toBe("moim_room_caption_main");
    expect(surface(moim({ kind: "schedule", scheduleId: "s1" })).captionKey).toBe("moim_room_caption_schedule");
    expect(surface(moim({ homeOpen: false, moimStatus: "deleted" })).captionKey).toBeNull();
    expect(surface(null, "loading").captionKey).toBeNull();
  });

  it("진입점(모임 홈·일정 보기·모임 공지) = homeOpen 일 때만 (A9·A10)", () => {
    expect(surface(moim()).moimEntry).toBe(true);
    expect(surface(moim({ homeOpen: false })).moimEntry).toBe(false);
    /** 옛 응답(homeOpen 없음)도 열지 않는다 */
    expect(surface(moim({ homeOpen: undefined })).moimEntry).toBe(false);
  });

  it("타임라인 「내 신원」 조각·부제 대체 문구 = 모임 방·pending 에서 없음 (A6·A18)", () => {
    expect(surface(null).identityChip).toBe(true);
    expect(surface(moim()).identityChip).toBe(false);
    expect(surface(null, "failed").identityChip).toBe(false);
    expect(surface(null).memberSubtitleFallback).toBe(true);
    expect(surface(moim()).memberSubtitleFallback).toBe(false);
  });

  it("읽기 전용 이유 키 (A16)", () => {
    expect(surface(moim({ readonlyReason: "moim_closed" })).readonlyNoticeKey).toBe("moim_room_readonly_closed");
    expect(surface(moim({ readonlyReason: "moim_blocked" })).readonlyNoticeKey).toBe("moim_room_readonly_blocked");
    expect(surface(moim({ readonlyReason: "moim_deleted" })).readonlyNoticeKey).toBe("moim_room_readonly_deleted");
    expect(surface(moim({ readonlyReason: "schedule_done" })).readonlyNoticeKey).toBe("moim_room_readonly_schedule_done");
    expect(surface(moim({ readonlyReason: "schedule_cancelled" })).readonlyNoticeKey).toBe("moim_room_readonly_schedule_cancelled");
    expect(surface(moim()).readonlyNoticeKey).toBeNull();
  });
});

describe("vm 에서 같은 규칙 다시 만들기 (isPrivateGroupRoom·isMoimRoom·moimRoomOwner)", () => {
  it("owner 있음 = moim · isMoimRoom 인데 owner 없음 = pending · 아님 = not_moim", () => {
    const v = (isMoimRoom: boolean, owner: MoimRoomOwner | null) =>
      resolveMoimRoomSurfaceFromView({ isPrivateGroupRoom: true, isMoimRoom, moimRoomOwner: owner, viewerUserId: "u" }).state;
    expect(v(true, moim())).toBe("moim");
    expect(v(true, null)).toBe("pending");
    expect(v(false, null)).toBe("not_moim");
    expect(
      resolveMoimRoomSurfaceFromView({ isPrivateGroupRoom: false, isMoimRoom: false, moimRoomOwner: null, viewerUserId: "u" }).state
    ).toBe("not_moim");
  });
});

describe("순수 함수 (A6 · A10 · A16 · A18 · A24)", () => {
  const not = surface(null);
  const pend = surface(null, "loading");
  const m = surface(moim());

  it("A6 칩 조각 — 모임: 「비공개 그룹」·「별칭」 없음 / pending: 종류 칸 없고 앞 구분자도 없음", () => {
    expect(
      buildRoomTimelineChipParts({
        roomTypeLabel: translate("ko", "moim_room_type_moim"),
        memberCountLabel: "멤버 18명",
        myIdentityLabel: "내 신원 · 별칭",
        surface: m,
      }).join(" · ")
    ).toBe("모임 채팅방 · 멤버 18명");
    expect(buildRoomTimelineChipParts({ roomTypeLabel: "", memberCountLabel: "멤버 18명", myIdentityLabel: "내 신원", surface: pend }).join(" · ")).toBe(
      "멤버 18명"
    );
    expect(
      buildRoomTimelineChipParts({ roomTypeLabel: "비공개 그룹", memberCountLabel: null, myIdentityLabel: "내 신원 · 실명", surface: not }).join(" · ")
    ).toBe("비공개 그룹 · 내 신원 · 실명");
  });

  it("A16 · 신규1 — active+readonly 일반 방 = 한 문장(고치기 전 두 문장) · 모임 종료 = 종료 문장", () => {
    expect(resolveRoomReadonlyNotice({ roomStatus: "active", isReadonly: true, surface: not })).toBe("nav_messenger_room_readonly_notice");
    expect(resolveRoomReadonlyNotice({ roomStatus: "active", isReadonly: true, surface: surface(moim({ readonlyReason: "moim_closed" })) })).toBe(
      "moim_room_readonly_closed"
    );
    /** blocked·archived 는 기존 문장(부르는 쪽) */
    expect(resolveRoomReadonlyNotice({ roomStatus: "blocked", isReadonly: true, surface: not })).toBeNull();
  });

  it("A16 입력창 2행 — 모임 방 room_readonly 는 같은 이유 문장, 그 밖 막힘은 그대로", () => {
    const t = (k: string) => `T:${k}`;
    expect(withMoimReadonlyReason({ code: "room_readonly", hideReason: false }, "moim_room_readonly_closed", t)).toEqual({
      code: null,
      hideReason: false,
      fallbackMessage: "T:moim_room_readonly_closed",
    });
    expect(withMoimReadonlyReason({ code: "room_blocked" }, "moim_room_readonly_closed", t)).toEqual({ code: "room_blocked" });
    expect(withMoimReadonlyReason({ code: "room_readonly" }, null, t)).toEqual({ code: "room_readonly" });
  });

  it("A10 공지 줄 — 조회 실패 = failed (고치기 전: 공지 없음과 같음)", () => {
    expect(resolveMoimRoomNoticeRow({ ok: false }).status).toBe("failed");
    expect(resolveMoimRoomNoticeRow({ ok: true, items: [], noticeBoardId: "b1" })).toEqual({ status: "ready", notice: null, noticeBoardId: "b1" });
    expect(resolveMoimRoomNoticeRow({ ok: true, items: [{ id: "p1", title: " 공지 ", body: "" }] }).notice).toEqual({ postId: "p1", text: "공지" });
    expect(translate("ko", "moim_room_notice_load_failed")).toBe("공지를 불러오지 못했어요");
  });

  it("A18 부제 — 모임 방은 소개만, 없으면 빈칸(「별칭 참여」 없음)", () => {
    expect(resolveRoomMemberSubtitle({ subtitle: "", fallback: "별칭 참여", surface: m })).toBe("");
    expect(resolveRoomMemberSubtitle({ subtitle: "배드민턴 다시 시작해요", fallback: "별칭 참여", surface: m })).toBe("배드민턴 다시 시작해요");
    expect(resolveRoomMemberSubtitle({ subtitle: null, fallback: "별칭 참여", surface: not })).toBe("별칭 참여");
  });

  it("A24 일정 방 목록 둘째 줄·머리글 상태 줄", () => {
    const fmt = (iso: string) => `F(${iso})`;
    const sched = moim({ kind: "schedule", scheduleId: "s1", scheduleStartsAt: "2026-11-15T10:00:00Z" });
    expect(resolveMoimScheduleListSubline(sched, fmt)).toBe("BGC 배드민턴 · F(2026-11-15T10:00:00Z)");
    expect(resolveMoimScheduleListSubline(moim(), fmt)).toBeNull();
    expect(resolveMoimScheduleListSubline(null, fmt)).toBeNull();
    const t = (k: string, v?: Record<string, string | number>) => translate("ko", k as never, v);
    expect(resolveMoimRoomHeaderStatus({ surface: m, owner: moim(), memberCount: 18, t, formatStartsAt: fmt })).toBe("멤버 18");
    expect(resolveMoimRoomHeaderStatus({ surface: surface(sched), owner: sched, memberCount: 4, t, formatStartsAt: fmt })).toBe(
      "BGC 배드민턴 · F(2026-11-15T10:00:00Z)"
    );
    expect(resolveMoimRoomHeaderStatus({ surface: pend, owner: null, memberCount: 4, t, formatStartsAt: fmt })).toBeNull();
  });

  it("「모임 홈」 진입 = homeOpen 만 본다 (A9 — 고치기 전: 종료+열람 끝이어도 보임)", () => {
    expect(moimRoomOwnerShowsHome(moim({ moimStatus: "closed", homeOpen: false }))).toBe(false);
    expect(moimRoomOwnerShowsHome(moim({ moimStatus: "closed", homeOpen: true }))).toBe(true);
    expect(moimRoomOwnerShowsHome(null)).toBe(false);
  });
});

describe("구조 확인 — 표면 규칙을 쓰는 파일에 모임 깃발 없는 관리 조건이 남지 않음 (동작 시험 아님)", () => {
  const files = [
    "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx",
    "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx",
    "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx",
    "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx",
    "components/community-messenger/MessengerChatListItem.tsx",
    "components/community-messenger/MessengerChatRoomActionSheet.tsx",
    "lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts",
  ];

  it("관리 UI 자리의 `vm.isPrivateGroupRoom ? (` 단독 조건이 없다 — 남은 것은 미디어 앨범(관리 UI 아님) 1곳", () => {
    const sheets = readFileSync(files[0], "utf8");
    const bare = sheets.match(/\{vm\.isPrivateGroupRoom \? \(/g) ?? [];
    expect(bare.length).toBe(1);
    expect(sheets).toMatch(/\{vm\.isPrivateGroupRoom \? \(\s*<GroupRoomMediaAlbumTabs/);
    const modal = readFileSync(files[1], "utf8");
    /** 3칸 표는 모임 깃발과 같이 · 남은 단독 조건 1곳은 「그룹에서 차단」(이미 canKickGroupMembers 블록 안 — 모임 방에서 막힘) */
    expect(modal).toContain("{vm.isPrivateGroupRoom && moimSurface.messengerManagement ? (");
    expect(modal.match(/\{vm\.isPrivateGroupRoom \? \(/g)?.length).toBe(1);
    const kick = modal.indexOf("{vm.canKickGroupMembers &&");
    expect(kick).toBeGreaterThan(0);
    expect(modal.indexOf("{vm.isPrivateGroupRoom ? (")).toBeGreaterThan(kick);
  });

  it("모든 파일이 같은 도우미를 쓴다 · `moim_room_managed_in_moim` 사용 없음", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/resolveMoimRoomSurface(FromView)?\(/);
      expect(src, f).not.toContain("moim_room_managed_in_moim");
    }
  });

  it("[통화] 버튼·통화 시트 줄은 그대로 (통화 규정)", () => {
    const modal = readFileSync(files[1], "utf8");
    expect(modal).toContain('data-cm-member-call=""');
    expect(modal).toContain("onClick={() => setCallSheetOpen(true)}");
    expect(modal).not.toMatch(/showStartDirectChat[^\n]*data-cm-member-call/);
  });
});
