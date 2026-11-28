/**
 * 모임 API 응답 형태 — 서버(app/api/moim/**)와 화면(app/(main)/moim/**)이 같이 쓴다.
 * 날짜는 ISO 문자열. 사람 표시는 모임별 프로필(닉네임·사진)만 — 전화번호·DIBAY ID·주소는 넣지 않는다(설계 §4).
 */
import type { MoimAction, MoimMemberStatus, MoimPlatformState, MoimRole, MoimStatus } from "@/lib/moim/moim-permission-contract";
import type { MoimPolicyLabelItem } from "@/lib/moim/moim-report-reasons";

export type MoimCategoryDto = {
  id: string;
  slug: string;
  labelKo: string;
  labelEn: string;
  /** 이 카테고리를 고르면 모임장이 주제를 직접 적는다 (「기타」) */
  allowCustomTopic: boolean;
};

/**
 * 보는 사람의 모임 동네 (대표 주소의 시/군만 — 그 밖의 주소 정보는 넣지 않는다).
 * `no_address` = 대표 주소 없음 · `city_unresolved` = 대표 주소는 있으나 시/군을 정할 수 없음(주소를 다시 저장해야 함)
 */
export type MoimViewerAreaDto =
  | { status: "ok"; cityLabel: string | null }
  | { status: "no_address" }
  | { status: "city_unresolved" }
  | { status: "unavailable" };

/**
 * 모임 이름·소개 글자 수 (운영 `moim_policies` · 감사 B11). 만들기·정보 수정 화면이 입력 단계에서 바로 보여 주고 막는다.
 * 값이 비어 있으면 서버 검사(`moim_create`·`moim_update_info`)와 같은 기본값: 이름 1~60 · 소개 0~2000.
 */
export type MoimTextLimitsDto = {
  nameMin: number;
  nameMax: number;
  introMin: number;
  introMax: number;
  /**
   * 금지 모임 유형 안내 (운영 `moim_policies.prohibited_types` · R4 §3) — 만들기 화면이 같은 응답으로 받는다.
   * 없으면(옛 DB·읽기 실패) 화면이 기본 8개를 쓴다.
   */
  prohibitedTypes?: MoimPolicyLabelItem[];
};

export const MOIM_TEXT_LIMITS_FALLBACK: MoimTextLimitsDto = { nameMin: 1, nameMax: 60, introMin: 0, introMax: 2000 };

export type MoimCardDto = {
  id: string;
  name: string;
  intro: string;
  coverImageUrl: string | null;
  category: MoimCategoryDto | null;
  /** 직접 주제 (카드·공개 페이지에서 카테고리 대신 보인다) */
  topicLabel: string | null;
  cityLabel: string | null;
  joinMode: "instant" | "approval";
  capacity: number | null;
  memberCount: number;
  lastActivityAt: string;
  /** 보는 사람의 상태 (비로그인·비멤버면 null) */
  viewerStatus: MoimMemberStatus | null;
  viewerRole: MoimRole | null;
  /** 모임 상태 — 내 모임에는 열람 기간 안의 종료 모임도 온다(카드 「종료」 · R3 U-12) */
  status: MoimStatus;
  /** 모집 중인 시작 전 일정이 있는가 — 카드 목록 select 안의 관계 행으로 판정(추가 요청 없음 · R3 U1-card-badge-sched) */
  hasRecruitingSchedule: boolean;
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
  /** R5 B19: 게시판 이름(사용자 게시판 = 이름, 시스템 게시판 = null) — 비멤버 공개 글도 이름을 보인다 */
  boardName: string | null;
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
  /** 직접 주제 (카드·공개 페이지에서 카테고리 대신 보인다) */
  topicLabel: string | null;
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
  /** 멤버에게만. R5 C15: 닫은 게시판까지 전부(`isActive` 로 구분) — 글쓰기·칩은 `isActive` 만 쓴다 */
  boards: MoimBoardDto[];
  /** 고정 공지 (멤버면 전부, 비멤버면 public 만) */
  pinnedNotices: MoimPostDto[];
  /** 최근 글 (멤버면 전부, 비멤버면 public 만) */
  recentPosts: MoimPostDto[];
  /** 다가오는 일정 (제목·시간·장소·인원만 — 비멤버도 보임, 설계 §6 P2 · R3 D-6) */
  upcomingSchedules: { id: string; title: string; startsAt: string; placeText: string | null; confirmedCount: number; capacity: number | null; status: string }[];
  /** 종료 후 멤버 열람 기간(일, 운영 정책) — 모임장에게만 채움, 정책 없음·비모임장 = null */
  closedRetentionDays: number | null;
  /**
   * 신고 시트에 보일 켜진 신고 사유 (운영 `moim_policies.report_reasons` · R4 §3 — 정책 공유 캐시라 추가 요청 없음).
   * null·없음 = 옛 DB·읽기 실패 → 시트가 기본 12개를 쓴다.
   */
  reportReasons?: MoimPolicyLabelItem[] | null;
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
    /** R5 C5: 내가(모임장) 보낸 직접 위임 요청 — 모임장일 때만 채움, 없으면 null */
    outgoingHostTransfer: { id: string; toUserId: string; toNickname: string; createdAt: string } | null;
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

/**
 * 차단 목록 줄. R5 E3: byPlatform = 플랫폼 어드민이 건 차단 — 사유는 돌려주지 않고(reason=null) 운영진은 풀 수 없다(서버 moim_ban_admin_only).
 */
export type MoimBannedDto = { userId: string; nickname: string; avatarUrl: string | null; reason: string | null; createdAt: string; byPlatform: boolean };

/** R5 C14: 멤버 목록 한 번에 받는 상한 (상한에 닿으면 응답 `capped: true`) */
export const MOIM_MEMBER_LIST_CAP = 1000;

export type MoimInviteLinkDto = { id: string; token: string; expiresAt: string | null; usageCount: number; createdAt: string };

export type MoimReceivedInviteDto = {
  id: string;
  moim: MoimCardDto;
  inviterNickname: string;
  createdAt: string;
  /** R3 U-13: 수락이 가입 신청이 되는 초대(승인제 · 초대한 사람이 운영진 미만)일 때만 가입 질문, 그 밖은 빈 배열 */
  joinQuestions: string[];
};

/**
 * R4 #6: 운영 목록(가입 신청·차단·초대 링크·메모·일정 참여자) 한 번에 받는 상한 — 서버 조회 상한과 화면 안내(「N개까지만」)가 같은 값을 쓴다.
 * 응답 `capped`(메모는 `notesCapped`) = 받은 수가 상한에 닿음.
 */
export const MOIM_LIST_CAP = 500;
export function moimListCapped(count: number): boolean {
  return count >= MOIM_LIST_CAP;
}

/** R4 #4·5: 시각 커서 쪽 — `nextBefore` 를 그대로 다음 요청 `before` 로 돌려준다(null = 마지막 쪽) */
export type MoimPageDto<T> = { items: T[]; nextBefore: string | null };

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

export type MoimNotificationPrefsDto = {
  notice: boolean;
  posts: boolean;
  schedules: boolean;
  /** R5 B21: 모임 채팅방 알림이 꺼졌는가(메신저 음소거 권위 — 대표 방·나). 읽지 못하면 null. 이 화면에서는 바꾸지 않는다 */
  chatMuted?: boolean | null;
};

/**
 * R5 B1 · E8 · D-36: 「내가 쓴 글·댓글·사진」 한 줄 (`GET /api/moim/my-content`).
 * 숨겨진 것도 포함(작성자가 지울 수 있음). 삭제된 모임은 제외. 신고자·숨긴 사람·숨김 사유는 담지 않는다.
 */
export type MoimMyContentType = "post" | "comment" | "album";
export type MoimMyContentItemDto = {
  id: string;
  type: MoimMyContentType;
  moimId: string;
  moimName: string;
  moimStatus: "active" | "closed";
  viewerIsActiveMember: boolean;
  status: "active" | "hidden";
  /** 글 제목 */
  title?: string | null;
  /** 글·댓글 본문 앞부분 */
  excerpt?: string | null;
  /** 사진 주소 */
  imageUrl?: string | null;
  /** 댓글이면 글 id·글 제목 */
  postId?: string | null;
  postTitle?: string | null;
  createdAt: string;
};

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
  /** R5 C3: 보는 사람(운영진)이 이 콘텐츠의 작성자 — 처리 버튼이 「숨김」이 아니라 「삭제」 */
  viewerIsAuthor: boolean;
};
