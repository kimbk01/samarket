"use client";

import { isPhoneVerificationRequiredApiPayload } from "@/lib/auth/phone-verification-required-detect";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
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
    if (data && isPhoneVerificationRequiredApiPayload(data)) {
      openPhoneVerificationRequiredSheet({ next: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined });
      return { ok: false, error: "moim_phone_verification_required" };
    }
    if (!data) return { ok: false, error: "moim_unknown" };
    if (data.ok === true) return data as MoimApiResult<T>;
    const error = typeof data.error === "string" ? data.error : "moim_unknown";
    const code = typeof data.code === "string" ? data.code : undefined;
    return { ok: false, error: code === "moim_rate_limited" ? code : error, code };
  } catch {
    return { ok: false, error: "moim_unknown" };
  }
}

/** 오류 코드 → 문구 키 (모르는 코드는 일반 안내) */
export function moimErrorKey(error: string | undefined | null): MessageKey {
  const e = (error ?? "").trim();
  if (/^moim_[a-z_]+$/.test(e)) return `moim_err_${e}` as MessageKey;
  return "moim_err_moim_unknown";
}

const enc = encodeURIComponent;

export const moimApi = {
  categories: () => call<{ categories: MoimCategoryDto[] }>("/api/moim/categories"),
  listMine: () => call<{ items: MoimCardDto[] }>("/api/moim?scope=mine"),
  listLocal: (q: { category?: string | null; q?: string | null; before?: string | null }) => {
    const sp = new URLSearchParams({ scope: "local" });
    if (q.category) sp.set("category", q.category);
    if (q.q) sp.set("q", q.q);
    if (q.before) sp.set("before", q.before);
    return call<{ items: MoimCardDto[]; nextBefore: string | null; hasAddress: boolean }>(`/api/moim?${sp}`);
  },
  create: (input: {
    name: string;
    intro: string;
    categoryId: string;
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

  detail: (moimId: string) => call<{ moim: MoimDetailDto }>(`/api/moim/${enc(moimId)}`),
  updateInfo: (
    moimId: string,
    patch: Partial<{
      name: string;
      intro: string;
      categoryId: string;
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

  members: (moimId: string) => call<{ members: MoimMemberDto[] }>(`/api/moim/${enc(moimId)}/members`),
  banned: (moimId: string) => call<{ banned: MoimBannedDto[] }>(`/api/moim/${enc(moimId)}/members?view=banned`),
  setRole: (moimId: string, userId: string, role: Exclude<MoimRole, "host">) =>
    call(`/api/moim/${enc(moimId)}/members/${enc(userId)}`, { method: "PATCH", json: { role } }),
  setNote: (moimId: string, userId: string, note: string) =>
    call(`/api/moim/${enc(moimId)}/members/${enc(userId)}`, { method: "PATCH", json: { note } }),
  removeMember: (moimId: string, userId: string, ban: boolean, reason?: string | null) =>
    call(`/api/moim/${enc(moimId)}/members/${enc(userId)}/remove`, { method: "POST", json: { ban, reason: reason ?? null } }),
  unban: (moimId: string, userId: string) => call(`/api/moim/${enc(moimId)}/members/${enc(userId)}/unban`, { method: "POST" }),

  joinRequests: (moimId: string) => call<{ requests: MoimJoinRequestDto[] }>(`/api/moim/${enc(moimId)}/join-requests`),
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
  respondHostTransfer: (transferId: string, accept: boolean) =>
    call<{ accepted: boolean; moim_id?: string }>(`/api/moim/host-transfers/${enc(transferId)}`, { method: "POST", json: { accept } }),

  inviteLinks: (moimId: string) => call<{ links: MoimInviteLinkDto[] }>(`/api/moim/${enc(moimId)}/invite-links`),
  createInviteLink: (moimId: string, expiresAt: string | null) =>
    call<{ invite_id: string; token: string }>(`/api/moim/${enc(moimId)}/invite-links`, { method: "POST", json: { expiresAt } }),
  revokeInviteLink: (inviteId: string) => call(`/api/moim/invite-links/${enc(inviteId)}`, { method: "DELETE" }),
  resolveInvite: (token: string) => call<{ moimId: string }>(`/api/moim/invite/${enc(token)}`),
  sendInvite: (moimId: string, userId: string) =>
    call<{ invite_target_id: string }>(`/api/moim/${enc(moimId)}/invites`, { method: "POST", json: { userId } }),
  receivedInvites: () => call<{ invites: MoimReceivedInviteDto[] }>("/api/moim/invites"),
  respondInvite: (inviteId: string, accept: boolean, profile?: { nickname?: string; avatarUrl?: string | null; bio?: string }) =>
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
  createPost: (moimId: string, input: { boardId: string; title?: string; body: string; images?: string[]; visibility?: "members" | "public" }) =>
    call<{ post_id: string; board_kind: string }>(`/api/moim/${enc(moimId)}/posts`, { method: "POST", json: input }),
  post: (postId: string) => call<{ post: MoimPostDto; comments: MoimCommentDto[]; viewerIsMember: boolean }>(`/api/moim/posts/${enc(postId)}`),
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

  report: (moimId: string, input: { targetType: string; targetId: string; reasonCode: string; detail?: string | null }) =>
    call<{ report_id: string }>(`/api/moim/${enc(moimId)}/reports`, { method: "POST", json: input }),

  // M4 — 일정·앨범·모임별 알림 설정
  schedules: (moimId: string, scope: "upcoming" | "past" = "upcoming") =>
    call<{ items: MoimScheduleDto[] }>(`/api/moim/${enc(moimId)}/schedules?scope=${scope}`),
  createSchedule: (moimId: string, input: MoimScheduleClientInput) =>
    call<{ schedule_id: string; room_id: string }>(`/api/moim/${enc(moimId)}/schedules`, { method: "POST", json: input }),
  schedule: (scheduleId: string) =>
    call<{ schedule: MoimScheduleDto; participants: MoimScheduleParticipantDto[] }>(`/api/moim/schedules/${enc(scheduleId)}`),
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
  home: (id: string) => `/moim/${id}`,
  board: (id: string, boardId: string) => `/moim/${id}?tab=board&board=${boardId}`,
  members: (id: string) => `/moim/${id}?tab=members`,
  post: (id: string, postId: string) => `/moim/${id}/posts/${postId}`,
  write: (id: string, boardId?: string) => `/moim/${id}/write${boardId ? `?board=${boardId}` : ""}`,
  join: (id: string) => `/moim/${id}/join`,
  profile: (id: string) => `/moim/${id}/profile`,
  manage: (id: string) => `/moim/${id}/manage`,
  manageRequests: (id: string) => `/moim/${id}/manage/requests`,
  manageMembers: (id: string) => `/moim/${id}/manage/members`,
  managePermissions: (id: string) => `/moim/${id}/manage/permissions`,
  manageInfo: (id: string) => `/moim/${id}/manage/info`,
  manageInvite: (id: string) => `/moim/${id}/manage/invite`,
  manageBoards: (id: string) => `/moim/${id}/manage/boards`,
  manageTransfer: (id: string) => `/moim/${id}/manage/transfer`,
  manageHostRequest: (id: string) => `/moim/${id}/manage/host-request`,
  manageClose: (id: string) => `/moim/${id}/manage/close`,
  inviteLanding: (token: string) => `/moim/i/${token}`,
  schedules: (id: string) => `/moim/${id}?tab=schedules`,
  schedule: (id: string, scheduleId: string) => `/moim/${id}/schedules/${scheduleId}`,
  scheduleNew: (id: string) => `/moim/${id}/schedules/new`,
  scheduleEdit: (id: string, scheduleId: string) => `/moim/${id}/schedules/${scheduleId}/edit`,
  album: (id: string) => `/moim/${id}?tab=album`,
  notificationSettings: (id: string) => `/moim/${id}/settings/notifications`,
};
