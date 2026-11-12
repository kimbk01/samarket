/**
 * 모임 API 응답 형태 — 서버(app/api/moim/**)와 화면(app/(main)/moim/**)이 같이 쓴다.
 * 날짜는 ISO 문자열. 사람 표시는 모임별 프로필(닉네임·사진)만 — 전화번호·DIBAY ID·주소는 넣지 않는다(설계 §4).
 */
import type { MoimAction, MoimMemberStatus, MoimPlatformState, MoimRole, MoimStatus } from "@/lib/moim/moim-permission-contract";

export type MoimCategoryDto = { id: string; slug: string; labelKo: string; labelEn: string };

export type MoimCardDto = {
  id: string;
  name: string;
  intro: string;
  coverImageUrl: string | null;
  category: MoimCategoryDto | null;
  cityLabel: string | null;
  joinMode: "instant" | "approval";
  capacity: number | null;
  memberCount: number;
  lastActivityAt: string;
  /** 보는 사람의 상태 (비로그인·비멤버면 null) */
  viewerStatus: MoimMemberStatus | null;
  viewerRole: MoimRole | null;
};

export type MoimBoardDto = {
  id: string;
  kind: "notice" | "free" | "greeting" | "review" | "custom";
  name: string | null;
  writeMinRole: MoimRole;
  sortOrder: number;
  isActive: boolean;
};

export type MoimAuthorDto = { userId: string; nickname: string; avatarUrl: string | null; role: MoimRole | null; isActiveMember: boolean };

export type MoimPostDto = {
  id: string;
  moimId: string;
  boardId: string;
  boardKind: MoimBoardDto["kind"];
  title: string;
  body: string;
  images: string[];
  visibility: "members" | "public";
  isPinned: boolean;
  commentCount: number;
  author: MoimAuthorDto;
  createdAt: string;
  updatedAt: string;
  viewerIsAuthor: boolean;
};

export type MoimCommentDto = { id: string; postId: string; body: string; author: MoimAuthorDto; createdAt: string; viewerIsAuthor: boolean };

export type MoimDetailDto = {
  id: string;
  name: string;
  intro: string;
  coverImageUrl: string | null;
  category: MoimCategoryDto | null;
  cityLabel: string | null;
  joinMode: "instant" | "approval";
  capacity: number | null;
  memberCount: number;
  ageMinBirthYear: number | null;
  ageMaxBirthYear: number | null;
  status: MoimStatus;
  platformState: MoimPlatformState;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  host: MoimAuthorDto | null;
  joinQuestions: string[];
  boards: MoimBoardDto[];
  /** 고정 공지 (멤버면 전부, 비멤버면 public 만) */
  pinnedNotices: MoimPostDto[];
  /** 최근 글 (멤버면 전부, 비멤버면 public 만) */
  recentPosts: MoimPostDto[];
  /** 다가오는 일정 (제목·시간·인원만 — 비멤버도 보임, 설계 §6 P2) */
  upcomingSchedules: { id: string; title: string; startsAt: string; confirmedCount: number; capacity: number | null; status: string }[];
  viewer: {
    loggedIn: boolean;
    status: MoimMemberStatus | null;
    role: MoimRole | null;
    nickname: string | null;
    avatarUrl: string | null;
    bio: string | null;
    pendingRequestId: string | null;
    banned: boolean;
    /** 모임장에게 온 위임 요청 (내가 받는 사람일 때) */
    incomingHostTransferId: string | null;
    /** 이 모임 채팅방 (활성 멤버일 때만) */
    roomId: string | null;
  };
  /** 보는 사람이 할 수 있는 행동 (DB moim_actor_can 과 같은 판정, 화면 표시용) */
  can: Record<MoimAction, boolean>;
  permissionOverrides: Partial<Record<MoimAction, MoimRole>>;
};

export type MoimMemberDto = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string;
  role: MoimRole;
  joinedAt: string | null;
  /** 운영진에게만 */
  rejoinCount?: number;
  note?: string | null;
};

export type MoimJoinRequestDto = {
  id: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string;
  answers: { question: string; answer: string }[];
  createdAt: string;
  rejoinCount: number;
};

export type MoimBannedDto = { userId: string; nickname: string; avatarUrl: string | null; reason: string | null; createdAt: string };

export type MoimInviteLinkDto = { id: string; token: string; expiresAt: string | null; usageCount: number; createdAt: string };

export type MoimReceivedInviteDto = {
  id: string;
  moim: MoimCardDto;
  inviterNickname: string;
  createdAt: string;
};

export type MoimApiOk<T> = { ok: true } & T;
export type MoimApiError = { ok: false; error: string; code?: string };
export type MoimApiResult<T> = MoimApiOk<T> | MoimApiError;

// ---------------------------------------------------------------------------
// M4 — 일정·앨범·모임별 알림 설정
// ---------------------------------------------------------------------------
export type MoimScheduleStatus = "recruiting" | "full" | "closed" | "done" | "cancelled";
export type MoimScheduleParticipantStatus = "requested" | "confirmed" | "rejected" | "cancelled" | "removed";

export type MoimScheduleDto = {
  id: string;
  moimId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  placeText: string;
  description: string;
  images: string[];
  capacity: number | null;
  joinMode: "first_come" | "approval";
  askMotivation: boolean;
  status: MoimScheduleStatus;
  confirmedCount: number;
  host: MoimAuthorDto;
  createdAt: string;
  updatedAt: string;
  viewer: {
    status: MoimScheduleParticipantStatus | null;
    isHost: boolean;
    /** 일정 관리권자 (호스트 · 모임장 · 부모임장) */
    canManage: boolean;
    /** 참여 확정이면 일정 채팅방 */
    roomId: string | null;
  };
};

export type MoimScheduleParticipantDto = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  role: MoimRole | null;
  status: MoimScheduleParticipantStatus;
  motivation: string | null;
  attendance: "unknown" | "present" | "absent";
};

export type MoimAlbumItemDto = {
  id: string;
  url: string;
  isPinned: boolean;
  scheduleId: string | null;
  uploader: MoimAuthorDto;
  createdAt: string;
  viewerIsUploader: boolean;
};

export type MoimNotificationPrefsDto = { notice: boolean; posts: boolean; schedules: boolean };

// ---------------------------------------------------------------------------
// M6 — 모임 안 신고 확인 (운영진 hide_post · 설계 P13 「모임 안 처리」). 신고자 정보는 담지 않는다.
// ---------------------------------------------------------------------------
export type MoimStaffReportTargetType = "post" | "comment" | "album";

export type MoimStaffReportDto = {
  targetType: MoimStaffReportTargetType;
  targetId: string;
  /** 열린(접수·검토 중) 신고 수 */
  reportCount: number;
  /** 사유 코드별 건수 (많은 순) */
  reasons: { code: string; count: number }[];
  latestAt: string;
  /** 대상 상태 — active 일 때만 숨길 수 있다 */
  status: "active" | "hidden" | "deleted" | "missing";
  /** 글 제목(글) · 본문 일부(글·댓글) · 사진 주소(사진) */
  title: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  /** 댓글이면 글 id (글로 이동) */
  postId: string | null;
  authorNickname: string | null;
};
