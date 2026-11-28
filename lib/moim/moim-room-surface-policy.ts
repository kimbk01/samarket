import type { MessageKey } from "@/lib/i18n/messages";
import { moimRoomMemberRoleKey, type MoimRoomOwner, type MoimRoomOwnerStatus } from "@/lib/moim/use-moim-room-owner";

/**
 * 모임 방 표면 규칙 — 하나의 규칙·하나의 도우미 (모임 R5 A §1 · Owner 결정 1·2).
 * 메신저 방 화면·채팅 목록·길게 누르기·스와이프·알림 배너는 모임 방인지에 따라 숨길지를 **이 함수의 깃발로만** 정한다.
 * - 비공개 그룹(private_group)만 모임 방이 될 수 있다.
 * - 판정 중·실패(`pending`) = 모임 방처럼 메신저 관리 UI 를 숨긴다(결정 1). 실패는 다음 표시 때 다시 묻는다(`use-moim-room-owner.ts`).
 * docs/dibay-messenger-domain-group-hard-lock.md 「MOIM-owned GROUP rooms」.
 */
export type MoimRoomSurfaceState = "not_moim" | "moim" | "pending";

export type MoimRoomRoleKey = "moim_role_host" | "moim_role_co_host" | "moim_role_staff" | "moim_role_member";

export type MoimRoomSurface = {
  state: MoimRoomSurfaceState;
  /** 메신저 운영 UI 전부(카드·초대·권한·공지 편집·운영 이력·배지·왕관·3칸 표·역할·내보내기·차단·위임·나가기·삭제) */
  messengerManagement: boolean;
  /** 「모임 홈」·「일정 보기」·「모임 공지」 줄 — 모임 방이고 `homeOpen` 일 때만 */
  moimEntry: boolean;
  /** 멤버 시트 [1:1 대화] */
  startDirectChat: boolean;
  /** 방 종류 문구 — null 이면 기존 문구(not_moim) 또는 종류 칸 생략(pending, `hideRoomType`) */
  roomTypeLabelKey: MessageKey | null;
  /** pending — 방 종류·역할 칸을 그리지 않는다 */
  hideRoomType: boolean;
  /** 내 역할 문구 키 — moim 만. pending 은 칸 생략(`hideViewerRole`) */
  viewerRoleKey: MoimRoomRoleKey | null;
  hideViewerRole: boolean;
  /** 방 정보·서랍 아래 안내 */
  captionKey: MessageKey | null;
  /** 읽기 전용 이유 한 문장 (A16) */
  readonlyNoticeKey: MessageKey | null;
  /** 타임라인 칩 「내 신원 · 별칭」 조각 */
  identityChip: boolean;
  /** 참가자 부제 대체 문구(「별칭 참여」 등)를 쓸까 — 모임 방은 모임 소개만 */
  memberSubtitleFallback: boolean;
  /** 이름 옆 「· 운영진」 — moim 만 */
  memberRoleKey: (userId: string | null | undefined) => "moim_role_host" | "moim_role_co_host" | "moim_role_staff" | null;
};

export type MoimRoomSurfaceInput = {
  /** 비공개 그룹(private_group)만 모임 방이 될 수 있다 */
  roomType: string | null | undefined;
  /** `/api/moim/rooms` 결과 */
  owner: MoimRoomOwner | null | undefined;
  ownerStatus: MoimRoomOwnerStatus;
  viewerUserId: string | null | undefined;
};

const NO_ROLE = () => null;

const READONLY_KEY: Record<NonNullable<MoimRoomOwner["readonlyReason"]>, MessageKey> = {
  moim_deleted: "moim_room_readonly_deleted",
  moim_blocked: "moim_room_readonly_blocked",
  moim_closed: "moim_room_readonly_closed",
  schedule_cancelled: "moim_room_readonly_schedule_cancelled",
  schedule_done: "moim_room_readonly_schedule_done",
};

const NOT_MOIM: MoimRoomSurface = {
  state: "not_moim",
  messengerManagement: true,
  moimEntry: false,
  startDirectChat: true,
  roomTypeLabelKey: null,
  hideRoomType: false,
  viewerRoleKey: null,
  hideViewerRole: false,
  captionKey: null,
  readonlyNoticeKey: null,
  identityChip: true,
  memberSubtitleFallback: true,
  memberRoleKey: NO_ROLE,
};

const PENDING: MoimRoomSurface = {
  state: "pending",
  messengerManagement: false,
  moimEntry: false,
  startDirectChat: false,
  roomTypeLabelKey: null,
  hideRoomType: true,
  viewerRoleKey: null,
  hideViewerRole: true,
  captionKey: null,
  readonlyNoticeKey: null,
  identityChip: false,
  memberSubtitleFallback: false,
  memberRoleKey: NO_ROLE,
};

/** 「모임 홈」 등 진입점이 열리는가 — 서버 `homeOpen` (삭제·열람 끝·모임 행 없음 = false) */
function ownerHomeOpen(owner: MoimRoomOwner): boolean {
  return owner.homeOpen === true;
}

export function resolveMoimRoomSurface(input: MoimRoomSurfaceInput): MoimRoomSurface {
  if (input.roomType !== "private_group") return NOT_MOIM;
  if (input.ownerStatus !== "resolved") return PENDING;
  const owner = input.owner;
  if (!owner) return NOT_MOIM;
  const homeOpen = ownerHomeOpen(owner);
  const schedule = owner.kind === "schedule";
  const viewerRole = moimRoomMemberRoleKey(owner, input.viewerUserId) ?? "moim_role_member";
  return {
    state: "moim",
    messengerManagement: false,
    moimEntry: homeOpen,
    startDirectChat: owner.canStartDm === true,
    roomTypeLabelKey: schedule ? "moim_room_type_schedule" : "moim_room_type_moim",
    hideRoomType: false,
    viewerRoleKey: viewerRole,
    hideViewerRole: false,
    captionKey: homeOpen ? (schedule ? "moim_room_caption_schedule" : "moim_room_caption_main") : null,
    readonlyNoticeKey: owner.readonlyReason ? READONLY_KEY[owner.readonlyReason] ?? null : null,
    identityChip: false,
    memberSubtitleFallback: false,
    memberRoleKey: (userId) => moimRoomMemberRoleKey(owner, userId),
  };
}

/**
 * 방 화면 vm(`isPrivateGroupRoom`·`isMoimRoom`·`moimRoomOwner`)에서 같은 규칙을 다시 만든다.
 * vm 의 `isMoimRoom` = owner 있음 또는 판정 중·실패(비공개 그룹) 이므로 상태를 그대로 되살릴 수 있다.
 */
export function resolveMoimRoomSurfaceFromView(view: {
  isPrivateGroupRoom: boolean;
  isMoimRoom: boolean;
  moimRoomOwner: MoimRoomOwner | null | undefined;
  viewerUserId: string | null | undefined;
}): MoimRoomSurface {
  const ownerStatus: MoimRoomOwnerStatus = view.moimRoomOwner
    ? "resolved"
    : view.isMoimRoom
      ? "loading"
      : "resolved";
  return resolveMoimRoomSurface({
    roomType: view.isPrivateGroupRoom ? "private_group" : null,
    owner: view.moimRoomOwner ?? null,
    ownerStatus,
    viewerUserId: view.viewerUserId,
  });
}

/**
 * 타임라인 칩 조각 (A6) — 빈 조각은 빼고 구분자는 코드에서 붙인다(그룹 결함 D4 규칙).
 * 판정 중이면 방 종류가 빈칸이라 앞 구분자도 없다. 모임 방·판정 중이면 「내 신원 · 별칭」 조각을 뺀다.
 */
export function buildRoomTimelineChipParts(input: {
  roomTypeLabel: string | null | undefined;
  joinLabel?: string | null;
  roomIdentityLabel?: string | null;
  memberCountLabel?: string | null;
  myIdentityLabel?: string | null;
  surface: Pick<MoimRoomSurface, "identityChip">;
}): string[] {
  const parts = [input.roomTypeLabel, input.joinLabel, input.roomIdentityLabel, input.memberCountLabel];
  if (input.surface.identityChip) parts.push(input.myIdentityLabel);
  return parts.map((p) => p?.trim() ?? "").filter(Boolean);
}

/**
 * 읽기 전용 안내 한 문장 (A16 · 신규1).
 * - 모임 방 이유 키가 있으면 그 한 문장
 * - active + 읽기 전용 = `nav_messenger_room_readonly_notice` 한 문장
 * - 그 밖의 제한 상태는 null(부르는 쪽 기존 문장)
 */
export function resolveRoomReadonlyNotice(input: {
  roomStatus: string | null | undefined;
  isReadonly: boolean;
  surface: Pick<MoimRoomSurface, "readonlyNoticeKey">;
}): MessageKey | null {
  if (input.surface.readonlyNoticeKey) return input.surface.readonlyNoticeKey;
  if ((input.roomStatus ?? "active") === "active" && input.isReadonly) return "nav_messenger_room_readonly_notice";
  return null;
}

/** 참가자 시트 부제 (A18) — 모임 방이면 모임 소개만, 없으면 빈칸 */
export function resolveRoomMemberSubtitle(input: {
  subtitle: string | null | undefined;
  fallback: string;
  surface: Pick<MoimRoomSurface, "memberSubtitleFallback">;
}): string {
  const own = input.subtitle?.trim() ?? "";
  if (own) return own;
  return input.surface.memberSubtitleFallback ? input.fallback : "";
}

/** 일정 방 목록 행 둘째 줄 (A24 · 시안 U8 「BGC 배드민턴 · 11/15 오후 6시」) — 판정 전·모임 방이면 null(기존 둘째 줄) */
export function resolveMoimScheduleListSubline(
  owner: MoimRoomOwner | null | undefined,
  formatStartsAt: (iso: string) => string
): string | null {
  if (!owner || owner.kind !== "schedule") return null;
  const name = owner.moimName.trim();
  const at = owner.scheduleStartsAt ? formatStartsAt(owner.scheduleStartsAt) : "";
  const parts = [name, at].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * 입력창 막힘 안내 2행 (A16 §3) — 모임 방이 읽기 전용(`room_readonly`)이면 서버 문구 대신 모임 이유 한 문장.
 * 타임라인 안내와 같은 키라 한 화면에 두 문구가 다르게 나오지 않는다. 그 밖의 막힘은 그대로.
 */
export function withMoimReadonlyReason<T extends { code: string | null; fallbackMessage?: string | null }>(
  unavailable: T | null,
  readonlyNoticeKey: MessageKey | null,
  t: (key: MessageKey) => string
): T | null {
  if (!unavailable || !readonlyNoticeKey || unavailable.code !== "room_readonly") return unavailable;
  return { ...unavailable, code: null, fallbackMessage: t(readonlyNoticeKey) };
}

/**
 * 방 머리글 상태 줄 (A24 · 시안 U8) — 모임 방 = 「멤버 {count}」, 일정 방 = 「{모임 이름} · {일정 시각}」.
 * 모임 방이 아니거나 판정 중이면 null(기존 상태 줄). 입력 중 표시는 머리글 규칙이 먼저 본다.
 */
export function resolveMoimRoomHeaderStatus(input: {
  surface: Pick<MoimRoomSurface, "state">;
  owner: MoimRoomOwner | null | undefined;
  memberCount: number;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  formatStartsAt: (iso: string) => string;
}): string | null {
  if (input.surface.state !== "moim" || !input.owner) return null;
  if (input.owner.kind === "schedule") return resolveMoimScheduleListSubline(input.owner, input.formatStartsAt);
  return input.t("moim_room_header_members", { count: input.memberCount });
}

export type MoimRoomNoticeRow =
  | { status: "ready"; notice: { postId: string; text: string } | null; noticeBoardId: string | null }
  | { status: "failed"; notice: null; noticeBoardId: null };

/**
 * 서랍 「모임 공지」 줄 상태 (A10) — 조회 실패는 「공지 없음」과 다르다(「공지를 불러오지 못했어요」 · 누르면 모임 홈).
 */
export function resolveMoimRoomNoticeRow(
  result:
    | { ok: false }
    | { ok: true; items: { id: string; title: string; body: string }[]; noticeBoardId?: string | null }
): MoimRoomNoticeRow {
  if (!result.ok) return { status: "failed", notice: null, noticeBoardId: null };
  const post = result.items[0];
  const text = post ? post.title.trim() || post.body.split("\n")[0]?.trim() || "" : "";
  return { status: "ready", notice: post ? { postId: post.id, text } : null, noticeBoardId: result.noticeBoardId ?? null };
}
