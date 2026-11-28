"use client";

import { isPhoneVerificationRequiredApiPayload } from "@/lib/auth/phone-verification-required-detect";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { getHydrationSafeCurrentUser } from "@/lib/auth/get-current-user";
import { invalidateMoimDetailCache, readMoimDetailCached } from "@/lib/moim/moim-detail-cache";
import { markMoimRoomOwnersStale } from "@/lib/moim/use-moim-room-owner";
import type {
  MoimApiResult,
  MoimBannedDto,
  MoimCardDto,
  MoimCategoryDto,
  MoimCommentDto,
  MoimDetailDto,
  MoimInviteLinkDto,
  MoimJoinRequestDto,
  MoimMemberDto,
  MoimPostDto,
  MoimReceivedInviteDto,
  MoimAlbumItemDto,
  MoimNotificationPrefsDto,
  MoimScheduleDto,
  MoimScheduleParticipantDto,
  MoimViewerAreaDto,
  MoimStaffReportDto,
  MoimTextLimitsDto,
  MoimPageDto,
  MoimMyContentItemDto,
  MoimMyContentType,
} from "@/lib/moim/moim-api-types";
import type { MoimAction, MoimRole } from "@/lib/moim/moim-permission-contract";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 모임 화면 → API 호출 (app/api/moim/**). 모든 함수는 { ok:true, ... } | { ok:false, error } 를 돌려준다.
 * 오류 문구: moimErrorKey(error) → t(key). 전화 인증이 필요하면 인증 시트를 자동으로 연다.
 */

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<MoimApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    /**
     * 쓰기 요청이 끝나면(성공·실패 모두) 화면 간 공유 상세를 비운다 — 내가 바꾼 내용, 또는 다른 사람이 먼저 바꿔
     * 충돌(moim_conflict)난 최신 상태를 바로 다시 불러온다 (감사 E2 · 재감사 M2)
     */
    if ((init?.method ?? "GET").toUpperCase() !== "GET") {
      invalidateMoimDetailCache();
      /** R5 A §2: 모임 쓰기 뒤 메신저 모임 방 표시(역할·상태)도 다시 묻는다 — 쓰기 경로 하나라 빠지는 버튼이 없다 */
      markMoimRoomOwnersStale();
    }
    if (data && isPhoneVerificationRequiredApiPayload(data)) {
      openPhoneVerificationRequiredSheet({ next: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined });
      return { ok: false, error: "moim_phone_verification_required" };
    }
    if (!data) return { ok: false, error: "moim_unknown" };
    if (data.ok === true) return data as MoimApiResult<T>;
    /** 가입 진행 중(전화·대표 주소) — 안내 창은 요청 단계 장치가 이미 열었다(중복 방지, 재감사3 #9) */
    if (data.code === "signup_incomplete" && (data.step === "phone" || data.step === "address")) {
      return { ok: false, error: "moim_registration_required", code: "signup_incomplete" };
    }
    const error = typeof data.error === "string" ? data.error : "moim_unknown";
    const code = typeof data.code === "string" ? data.code : undefined;
    return { ok: false, error: code === "moim_rate_limited" ? code : error, code };
  } catch {
    /** 쓰기 응답이 끊겨도(시간 초과 등) 서버에는 저장됐을 수 있다 — 공유 상세를 비운다 (재감사 2차 낮음 1) */
    if ((init?.method ?? "GET").toUpperCase() !== "GET") {
      invalidateMoimDetailCache();
      markMoimRoomOwnersStale();
    }
    return { ok: false, error: "moim_unknown" };
  }
}

/** 오류 코드 → 문구 키 (모르는 코드는 일반 안내) */
export function moimErrorKey(error: string | undefined | null): MessageKey {
  const e = (error ?? "").trim();
  if (/^moim_[a-z_]+$/.test(e)) return `moim_err_${e}` as MessageKey;
  /** 공용 활동 제한 거절 — 일반 안내로 떨어뜨리지 않는다 (R3 U-15) */
  if (e === "member_activity_restricted") return "api_err_member_activity_restricted";
  if (e === "community_restricted") return "moim_err_community_restricted";
  if (e === "community_restriction_unavailable") return "moim_err_community_restriction_unavailable";
  return "moim_err_moim_unknown";
}

const enc = encodeURIComponent;

export const moimApi = {
  categories: () => call<{ categories: MoimCategoryDto[]; limits?: MoimTextLimitsDto }>("/api/moim/categories"),
  /** 만들기 화면 — 카테고리 + 개설자 모임 동네(대표 주소 시/군)를 한 요청으로 */
  categoriesWithArea: () =>
    call<{ categories: MoimCategoryDto[]; viewerArea: MoimViewerAreaDto; limits?: MoimTextLimitsDto }>("/api/moim/categories?withArea=1"),
  listMine: () => call<{ items: MoimCardDto[] }>("/api/moim?scope=mine"),
  listLocal: (q: { category?: string | null; q?: string | null; before?: string | null }) => {
    const sp = new URLSearchParams({ scope: "local" });
    if (q.category) sp.set("category", q.category);
    if (q.q) sp.set("q", q.q);
    if (q.before) sp.set("before", q.before);
    return call<{
      items: MoimCardDto[];
      nextBefore: string | null;
      hasAddress: boolean;
      areaStatus?: MoimViewerAreaDto["status"];
      /** 보는 사람 모임 동네(시/군) 이름 — 「{city} 모임」 제목 (R3 U1-local-title) */
      cityLabel?: string | null;
    }>(`/api/moim?${sp}`);
  },
  create: (input: {
    name: string;
    intro: string;
    categoryId: string;
    topicLabel?: string | null;
    joinMode: "instant" | "approval";
    capacity?: number | null;
    coverImageUrl?: string | null;
    ageMinBirthYear?: number | null;
    ageMaxBirthYear?: number | null;
    questions?: string[];
    nickname?: string;
    avatarUrl?: string | null;
    bio?: string;
  }) => call<{ moim_id: string; room_id: string }>("/api/moim", { method: "POST", json: input }),

  /** 모임 상세 — 화면끼리 60초 공유 · 동시 요청 1회 (감사 E2). `force` = 저장값 무시(다시 불러오기) */
  detail: (moimId: string, opts?: { force?: boolean }) =>
    readMoimDetailCached(getHydrationSafeCurrentUser()?.id ?? null, moimId, () => call<{ moim: MoimDetailDto }>(`/api/moim/${enc(moimId)}`), {
      force: opts?.force,
    }),
  updateInfo: (
    moimId: string,
    patch: Partial<{
      name: string;
      intro: string;
      categoryId: string;
      topicLabel: string | null;
      joinMode: "instant" | "approval";
      capacity: number | null;
      coverImageUrl: string | null;
      ageMinBirthYear: number | null;
      ageMaxBirthYear: number | null;
      questions: string[];
    }>,
    expectedUpdatedAt: string
  ) => call<{ updated_at: string }>(`/api/moim/${enc(moimId)}`, { method: "PATCH", json: { patch, expectedUpdatedAt } }),

  join: (moimId: string, input: { answers?: string[]; nickname?: string; avatarUrl?: string | null; bio?: string; inviteToken?: string | null }) =>
    call<{ status: "active" | "pending"; room_id?: string; request_id?: string }>(`/api/moim/${enc(moimId)}/join`, { method: "POST", json: input }),
  cancelJoin: (moimId: string) => call(`/api/moim/${enc(moimId)}/join`, { method: "DELETE" }),
  leave: (moimId: string) => call(`/api/moim/${enc(moimId)}/leave`, { method: "POST" }),
  close: (moimId: string, confirmName: string) => call(`/api/moim/${enc(moimId)}/close`, { method: "POST", json: { confirmName } }),

  /** R5 C14: capped = 멤버가 상한(MOIM_MEMBER_LIST_CAP)에 닿아 일부만 옴 */
  members: (moimId: string) => call<{ members: MoimMemberDto[]; notesCapped?: boolean; capped?: boolean }>(`/api/moim/${enc(moimId)}/members`),
  banned: (moimId: string) => call<{ banned: MoimBannedDto[]; capped?: boolean }>(`/api/moim/${enc(moimId)}/members?view=banned`),
  setRole: (moimId: string, userId: string, role: Exclude<MoimRole, "host">) =>
    call(`/api/moim/${enc(moimId)}/members/${enc(userId)}`, { method: "PATCH", json: { role } }),
  setNote: (moimId: string, userId: string, note: string) =>
    call(`/api/moim/${enc(moimId)}/members/${enc(userId)}`, { method: "PATCH", json: { note } }),
  removeMember: (moimId: string, userId: string, ban: boolean, reason?: string | null) =>
    call(`/api/moim/${enc(moimId)}/members/${enc(userId)}/remove`, { method: "POST", json: { ban, reason: reason ?? null } }),
  unban: (moimId: string, userId: string) => call(`/api/moim/${enc(moimId)}/members/${enc(userId)}/unban`, { method: "POST" }),

  joinRequests: (moimId: string) => call<{ requests: MoimJoinRequestDto[]; capped?: boolean }>(`/api/moim/${enc(moimId)}/join-requests`),
  /** M6 운영진 신고 확인 (hide_post) — 대상별 묶음, 신고자 정보 없음 */
  staffReports: (moimId: string) => call<{ reports: MoimStaffReportDto[]; capped: boolean }>(`/api/moim/${enc(moimId)}/reports`),
  decideJoin: (moimId: string, requestId: string, approve: boolean, reason?: string | null) =>
    call(`/api/moim/${enc(moimId)}/join-requests/${enc(requestId)}`, { method: "POST", json: { approve, reason: reason ?? null } }),

  setPermissions: (moimId: string, overrides: Partial<Record<MoimAction, MoimRole>>) =>
    call(`/api/moim/${enc(moimId)}/permissions`, { method: "PATCH", json: { overrides } }),
  updateProfile: (moimId: string, profile: { nickname?: string; avatarUrl?: string | null; bio?: string }) =>
    call(`/api/moim/${enc(moimId)}/profile`, { method: "PATCH", json: profile }),

  requestHostTransfer: (moimId: string, toUserId: string) =>
    call<{ transfer_id: string }>(`/api/moim/${enc(moimId)}/host-transfer`, { method: "POST", json: { toUserId } }),
  /** P8 미접속 모임장 변경 요청 (부모임장·운영진) → 어드민 큐 */
  requestInactiveHostChange: (moimId: string, toUserId: string, reason: string | null) =>
    call<{ transfer_id: string }>(`/api/moim/${enc(moimId)}/host-inactive-request`, { method: "POST", json: { toUserId, reason } }),
  /** R5 C5: 내가 보낸 직접 위임 요청 취소 */
  cancelHostTransfer: (transferId: string) => call(`/api/moim/host-transfers/${enc(transferId)}`, { method: "DELETE" }),
  respondHostTransfer: (transferId: string, accept: boolean) =>
    call<{ accepted: boolean; moim_id?: string }>(`/api/moim/host-transfers/${enc(transferId)}`, { method: "POST", json: { accept } }),

  inviteLinks: (moimId: string) => call<{ links: MoimInviteLinkDto[]; capped?: boolean }>(`/api/moim/${enc(moimId)}/invite-links`),
  /** R5 C19: reuse = 내가 만든 쓸 수 있는 링크(만료까지 24시간 넘게 남음)가 있으면 그것을 돌려받는다(머리글 공유) */
  createInviteLink: (moimId: string, expiresAt: string | null, opts?: { reuse?: boolean }) =>
    call<{ invite_id: string; token: string; reused?: boolean }>(`/api/moim/${enc(moimId)}/invite-links`, {
      method: "POST",
      json: { expiresAt, ...(opts?.reuse ? { reuse: true } : {}) },
    }),
  revokeInviteLink: (inviteId: string) => call(`/api/moim/invite-links/${enc(inviteId)}`, { method: "DELETE" }),
  resolveInvite: (token: string) => call<{ moimId: string }>(`/api/moim/invite/${enc(token)}`),
  sendInvite: (moimId: string, userId: string) =>
    call<{ invite_target_id: string }>(`/api/moim/${enc(moimId)}/invites`, { method: "POST", json: { userId } }),
  /** R5 C2: 초대 후보 확인 — 이미 멤버 · 초대할 수 없음(가입 신청 중·차단, 이유는 나누지 않음) */
  checkInviteCandidates: (moimId: string, userIds: string[]) =>
    call<{ members: string[]; unavailable: string[] }>(`/api/moim/${enc(moimId)}/invites/check`, { method: "POST", json: { userIds } }),
  receivedInvites: () => call<{ invites: MoimReceivedInviteDto[] }>("/api/moim/invites"),
  /** R3 U-13: 수락이 가입 신청이 되는 초대면 가입 질문 답 `answers` 를 함께 보낸다 */
  respondInvite: (inviteId: string, accept: boolean, profile?: { nickname?: string; avatarUrl?: string | null; bio?: string; answers?: string[] }) =>
    call<{ status: "active" | "pending" | "declined"; moim_id?: string }>(`/api/moim/invites/${enc(inviteId)}`, {
      method: "POST",
      json: { accept, ...(profile ?? {}) },
    }),

  posts: (moimId: string, q: { board?: string | null; before?: string | null }) => {
    const sp = new URLSearchParams();
    if (q.board) sp.set("board", q.board);
    if (q.before) sp.set("before", q.before);
    return call<{ items: MoimPostDto[]; nextBefore: string | null }>(`/api/moim/${enc(moimId)}/posts?${sp}`);
  },
  /** 공지 게시판의 최신 고정 공지 1건 + 공지 게시판 id (메신저 모임 방 메뉴, 4번 묶음 D1) */
  latestNotice: (moimId: string) =>
    call<{ items: MoimPostDto[]; nextBefore: string | null; noticeBoardId: string | null }>(`/api/moim/${enc(moimId)}/posts?pinned=1&limit=1`),
  createPost: (moimId: string, input: { boardId: string; title?: string; body: string; images?: string[]; visibility?: "members" | "public" }) =>
    call<{ post_id: string; board_kind: string }>(`/api/moim/${enc(moimId)}/posts`, { method: "POST", json: input }),
  post: (postId: string) =>
    call<{ post: MoimPostDto; comments: MoimCommentDto[]; commentsBefore?: string | null; viewerIsMember: boolean }>(`/api/moim/posts/${enc(postId)}`),
  /** R4 #4·5 「이전 댓글 더 보기」 — before = 글 상세 `commentsBefore` 또는 앞 쪽 `nextBefore` */
  comments: (postId: string, before: string) =>
    call<MoimPageDto<MoimCommentDto>>(`/api/moim/posts/${enc(postId)}/comments?before=${encodeURIComponent(before)}`),
  updatePost: (postId: string, patch: Partial<{ title: string; body: string; images: string[]; visibility: "members" | "public" }>) =>
    call(`/api/moim/posts/${enc(postId)}`, { method: "PATCH", json: patch }),
  removePost: (postId: string, reason?: string | null) =>
    call<{ result: "deleted" | "hidden" }>(`/api/moim/posts/${enc(postId)}`, { method: "DELETE", json: { reason: reason ?? null } }),
  pinPost: (postId: string, pinned: boolean) => call(`/api/moim/posts/${enc(postId)}/pin`, { method: "POST", json: { pinned } }),
  addComment: (postId: string, body: string) =>
    call<{ comment_id: string }>(`/api/moim/posts/${enc(postId)}/comments`, { method: "POST", json: { body } }),
  removeComment: (commentId: string) => call(`/api/moim/comments/${enc(commentId)}`, { method: "DELETE" }),
  saveBoard: (moimId: string, input: { boardId?: string; name?: string; writeMinRole?: MoimRole; isActive?: boolean }) =>
    call<{ board_id: string }>(`/api/moim/${enc(moimId)}/boards`, { method: "POST", json: input }),
  /** R5 C4: 켜진 게시판 전부를 새 순서로 */
  reorderBoards: (moimId: string, order: string[]) => call(`/api/moim/${enc(moimId)}/boards`, { method: "PUT", json: { order } }),
  /** R5 B1: 내가 쓴 글·댓글·사진 (숨김 포함, 삭제 모임 제외) */
  myContent: (q: { type: MoimMyContentType; moimId?: string | null; before?: string | null }) => {
    const sp = new URLSearchParams({ type: q.type });
    if (q.moimId) sp.set("moim", q.moimId);
    if (q.before) sp.set("before", q.before);
    return call<MoimPageDto<MoimMyContentItemDto>>(`/api/moim/my-content?${sp}`);
  },

  report: (moimId: string, input: { targetType: string; targetId: string; reasonCode: string; detail?: string | null }) =>
    call<{ report_id: string }>(`/api/moim/${enc(moimId)}/reports`, { method: "POST", json: input }),

  // M4 — 일정·앨범·모임별 알림 설정
  /** 모임 안 검색 (시안 U4 ⌕ · 감사 F11) — 멤버만 · 2~40자 */
  search: (moimId: string, q: string) =>
    call<{ posts: MoimPostDto[]; schedules: MoimScheduleDto[] }>(`/api/moim/${enc(moimId)}/search?q=${encodeURIComponent(q)}`),
  /** R4 #4·5 · #7·8: `limit`(홈 = 3) · `before`(지난 일정 다음 쪽 커서) */
  schedules: (moimId: string, scope: "upcoming" | "past" = "upcoming", opts: { limit?: number; before?: string | null } = {}) =>
    call<MoimPageDto<MoimScheduleDto>>(
      `/api/moim/${enc(moimId)}/schedules?scope=${scope}${opts.limit ? `&limit=${opts.limit}` : ""}${opts.before ? `&before=${encodeURIComponent(opts.before)}` : ""}`
    ),
  createSchedule: (moimId: string, input: MoimScheduleClientInput) =>
    call<{ schedule_id: string; room_id: string }>(`/api/moim/${enc(moimId)}/schedules`, { method: "POST", json: input }),
  schedule: (scheduleId: string) =>
    call<{ schedule: MoimScheduleDto; participants: MoimScheduleParticipantDto[]; participantsCapped?: boolean }>(`/api/moim/schedules/${enc(scheduleId)}`),
  updateSchedule: (scheduleId: string, input: MoimScheduleClientInput) =>
    call(`/api/moim/schedules/${enc(scheduleId)}`, { method: "PATCH", json: input }),
  cancelSchedule: (scheduleId: string) => call(`/api/moim/schedules/${enc(scheduleId)}`, { method: "DELETE" }),
  setScheduleClosed: (scheduleId: string, closed: boolean) =>
    call(`/api/moim/schedules/${enc(scheduleId)}/close`, { method: "POST", json: { closed } }),
  joinSchedule: (scheduleId: string, motivation?: string | null) =>
    call<{ status: "confirmed" | "requested"; room_id?: string }>(`/api/moim/schedules/${enc(scheduleId)}/join`, {
      method: "POST",
      json: { motivation: motivation ?? null },
    }),
  leaveSchedule: (scheduleId: string) => call(`/api/moim/schedules/${enc(scheduleId)}/join`, { method: "DELETE" }),
  decideScheduleParticipant: (scheduleId: string, userId: string, action: "approve" | "reject" | "remove") =>
    call(`/api/moim/schedules/${enc(scheduleId)}/participants/${enc(userId)}`, { method: "POST", json: { action } }),
  setAttendance: (scheduleId: string, userId: string, attendance: "present" | "absent" | "unknown") =>
    call(`/api/moim/schedules/${enc(scheduleId)}/participants/${enc(userId)}`, { method: "POST", json: { attendance } }),

  album: (moimId: string, q: { before?: string | null; pinned?: boolean; scheduleId?: string | null } = {}) => {
    const sp = new URLSearchParams();
    if (q.before) sp.set("before", q.before);
    if (q.pinned) sp.set("pinned", "1");
    if (q.scheduleId) sp.set("schedule", q.scheduleId);
    return call<{ items: MoimAlbumItemDto[]; nextBefore: string | null }>(`/api/moim/${enc(moimId)}/album?${sp}`);
  },
  addAlbum: (moimId: string, urls: string[], scheduleId?: string | null) =>
    call<{ added: number }>(`/api/moim/${enc(moimId)}/album`, { method: "POST", json: { urls, scheduleId: scheduleId ?? null } }),
  removeAlbum: (itemId: string) => call<{ result: "deleted" | "hidden" }>(`/api/moim/album/${enc(itemId)}`, { method: "DELETE" }),
  pinAlbum: (itemId: string, pinned: boolean) => call(`/api/moim/album/${enc(itemId)}/pin`, { method: "POST", json: { pinned } }),

  notificationPrefs: (moimId: string) => call<{ prefs: MoimNotificationPrefsDto }>(`/api/moim/${enc(moimId)}/notification-prefs`),
  setNotificationPrefs: (moimId: string, prefs: Partial<MoimNotificationPrefsDto>) =>
    call(`/api/moim/${enc(moimId)}/notification-prefs`, { method: "PATCH", json: prefs }),
};

export type MoimScheduleClientInput = Partial<{
  title: string;
  startsAt: string;
  endsAt: string | null;
  placeText: string;
  description: string;
  images: string[];
  capacity: number | null;
  joinMode: "first_come" | "approval";
  askMotivation: boolean;
}>;

export const moimRoutes = {
  tab: "/moim",
  search: "/moim/search",
  create: "/moim/new",
  invites: "/moim/invites",
  /** R5 B1: 내가 쓴 글·댓글·사진 (moimId 를 주면 그 모임만) */
  myContent: (moimId?: string | null) => `/moim/my-content${moimId ? `?moim=${encodeURIComponent(moimId)}` : ""}`,
  home: (id: string) => `/moim/${id}`,
  board: (id: string, boardId: string) => `/moim/${id}?tab=board&board=${boardId}`,
  members: (id: string) => `/moim/${id}?tab=members`,
  post: (id: string, postId: string) => `/moim/${id}/posts/${postId}`,
  write: (id: string, boardId?: string) => `/moim/${id}/write${boardId ? `?board=${boardId}` : ""}`,
  join: (id: string) => `/moim/${id}/join`,
  profile: (id: string) => `/moim/${id}/profile`,
  searchIn: (id: string) => `/moim/${id}/search`,
  manage: (id: string) => `/moim/${id}/manage`,
  /** R5 C22: from=members 면 가입 신청 화면 뒤로 = 멤버 관리 */
  manageRequests: (id: string, from?: "members") => `/moim/${id}/manage/requests${from ? `?from=${from}` : ""}`,
  manageMembers: (id: string) => `/moim/${id}/manage/members`,
  managePermissions: (id: string) => `/moim/${id}/manage/permissions`,
  manageInfo: (id: string) => `/moim/${id}/manage/info`,
  manageInvite: (id: string) => `/moim/${id}/manage/invite`,
  manageBoards: (id: string) => `/moim/${id}/manage/boards`,
  manageTransfer: (id: string) => `/moim/${id}/manage/transfer`,
  manageHostRequest: (id: string) => `/moim/${id}/manage/host-request`,
  manageReports: (id: string) => `/moim/${id}/manage/reports`,
  manageClose: (id: string) => `/moim/${id}/manage/close`,
  inviteLanding: (token: string) => `/moim/i/${token}`,
  schedules: (id: string) => `/moim/${id}?tab=schedules`,
  schedule: (id: string, scheduleId: string) => `/moim/${id}/schedules/${scheduleId}`,
  scheduleNew: (id: string) => `/moim/${id}/schedules/new`,
  scheduleEdit: (id: string, scheduleId: string) => `/moim/${id}/schedules/${scheduleId}/edit`,
  album: (id: string) => `/moim/${id}?tab=album`,
  notificationSettings: (id: string) => `/moim/${id}/settings/notifications`,
};
