/**
 * 모임 상태 → 화면에서 할 수 있는 동작 — 단일 정의 (R5 BC R-A).
 * 글 상세·일정 상세·일정 수정·위임 배너·운영 틀이 모임 상태(종료·차단·경고)·일정 상태(시작·취소)를 화면마다 따로 판단하던 것을
 * 여기 하나로 모은다. 서버 판정(`moim_actor_can` · RPC)이 늘 최종이다 — 이 함수는 서버가 거절할 버튼을 그리지 않게만 한다.
 *
 * 서버 전용 모듈을 가져오지 않는다(화면·라우트 공용).
 */
import type { MoimDetailDto, MoimPostDto, MoimScheduleDto } from "@/lib/moim/moim-api-types";

export type MoimReadOnlyReason = "closed" | "blocked";

type MoimStateLike = Pick<MoimDetailDto, "status" | "platformState">;

/** 읽기 전용 이유 — 종료(또는 삭제) 모임 = closed · 플랫폼 차단 = blocked · 그 밖 null */
export function moimReadOnlyReason(moim: MoimStateLike | null | undefined): MoimReadOnlyReason | null {
  if (!moim) return null;
  if (moim.status !== "active") return "closed";
  if (moim.platformState === "blocked") return "blocked";
  return null;
}

export type MoimPostFooter = "composer" | "login" | "pending" | "banned" | "readonly" | "join";

export type MoimPostGate = {
  canComment: boolean;
  canEdit: boolean;
  /** 작성자는 모임 상태와 상관없이 지울 수 있다 (D-36) */
  canDelete: boolean;
  canHide: boolean;
  canPin: boolean;
  canReport: boolean;
  footer: MoimPostFooter;
};

/**
 * 글 상세 동작. `isMember` = 글 응답의 `viewerIsMember`(활동 멤버).
 * - 읽기 전용 모임: 댓글·수정 없음, 하단 줄 = 상태 안내. 삭제(작성자)는 남는다
 * - 숨기기·고정은 상세 `can.*`(서버와 같은 판정)
 */
export function moimPostGate(
  moim: Pick<MoimDetailDto, "status" | "platformState" | "can" | "viewer">,
  post: Pick<MoimPostDto, "viewerIsAuthor" | "boardKind">,
  isMember: boolean
): MoimPostGate {
  const readOnly = moimReadOnlyReason(moim) != null;
  const author = post.viewerIsAuthor;
  const footer: MoimPostFooter = readOnly
    ? "readonly"
    : !moim.viewer.loggedIn
      ? "login"
      : isMember
        ? "composer"
        : moim.viewer.banned || moim.viewer.status === "banned"
          ? "banned"
          : moim.viewer.pendingRequestId || moim.viewer.status === "pending"
            ? "pending"
            : "join";
  return {
    canComment: isMember && !readOnly,
    canEdit: author && isMember && !readOnly && (post.boardKind !== "notice" || moim.can.pin_notice === true),
    canDelete: author,
    canHide: !author && !readOnly && moim.can.hide_post === true,
    canPin: post.boardKind === "notice" && !readOnly && moim.can.pin_notice === true,
    canReport: !author && moim.viewer.loggedIn,
    footer,
  };
}

export type MoimScheduleGate = {
  /** 일정이 끝나거나 취소되지 않았고, 모임이 읽기 전용이 아님 */
  live: boolean;
  /** 시작 시각이 지났다 */
  started: boolean;
  canEdit: boolean;
  canDecideRequests: boolean;
  canRemoveParticipant: boolean;
  canToggleClosed: boolean;
  canCancel: boolean;
  /** 출석 체크 — 시작한 뒤, 끝나기 전(취소 아님) 관리권자 */
  canAttendance: boolean;
  /** 내 참여 배지 — 취소된 일정에는 「취소됨」 배지만 */
  showMyBadge: boolean;
};

/** 일정 동작. `now` = 밀리초. 일정 관리권자 = `schedule.viewer.canManage` */
export function moimScheduleGate(moim: MoimStateLike | null | undefined, s: Pick<MoimScheduleDto, "status" | "startsAt" | "viewer">, now: number): MoimScheduleGate {
  const readOnly = moimReadOnlyReason(moim) != null;
  const ended = s.status === "done" || s.status === "cancelled";
  const live = !ended && !readOnly;
  const startMs = Date.parse(s.startsAt);
  const started = Number.isFinite(startMs) && startMs <= now;
  const manage = s.viewer.canManage && live;
  /** 시작한 일정의 수정·신청 결정·내보내기·마감은 서버가 거절한다 → 버튼을 그리지 않는다 (C6·C9) */
  const beforeStart = manage && !started;
  return {
    live,
    started,
    canEdit: beforeStart,
    canDecideRequests: beforeStart,
    canRemoveParticipant: beforeStart,
    canToggleClosed: beforeStart,
    /** 일정 취소 = 지금 조건(관리권자) + live */
    canCancel: manage,
    canAttendance: s.viewer.canManage && started && s.status !== "cancelled" && !readOnly,
    showMyBadge: s.status !== "cancelled",
  };
}

export type MoimHostTransferGate = {
  canAccept: boolean;
  canDecline: true;
  /** 수락할 수 없을 때 보일 안내 */
  blockedKey: "moim_transfer_banner_blocked" | null;
};

/** 위임 배너 — 활동 모임 + 플랫폼 상태 normal·unlisted 일 때만 수락(계약 P8·P14 「경고·차단이면 위임 불가」). 거절은 늘 된다 */
export function moimHostTransferGate(moim: MoimStateLike): MoimHostTransferGate {
  const canAccept = moim.status === "active" && (moim.platformState === "normal" || moim.platformState === "unlisted");
  return { canAccept, canDecline: true, blockedKey: canAccept ? null : "moim_transfer_banner_blocked" };
}

/** 위임 수락이 이 코드로 실패하면 배너가 낡은 것 — 다시 불러온다 */
export const MOIM_TRANSFER_STALE_ERRORS: ReadonlySet<string> = new Set([
  "moim_transfer_not_found",
  "moim_transfer_stale",
  "moim_transfer_blocked_by_warning",
  "moim_blocked",
]);

/** 운영 화면을 못 여는 상태 이유 (권한이 아닌 모임 상태 때문) */
export function moimManageBlockReason(moim: MoimStateLike | null | undefined): MoimReadOnlyReason | null {
  return moimReadOnlyReason(moim);
}

/** 나가기 성공 뒤 이동 — 활동 모임이 아니면 다시 불러와도 열 수 없으므로 모임 탭, 아니면 null(그 자리 다시 불러오기) */
export function moimAfterLeaveHref(moim: Pick<MoimDetailDto, "status">, tabHref: string): string | null {
  return moim.status !== "active" ? tabHref : null;
}

/** 가입 질문 답 상한 — 가입 시트 입력칸·가입 라우트·초대 수락 라우트·DB `moim_join` 이 같은 값 (R5 B11) */
export const MOIM_JOIN_ANSWER_MAX = 1000;

/**
 * 가입 질문 답 읽기 — 보내지 않았으면 undefined. 글자만·3개까지.
 * 1,000자를 넘는 답이 있으면 자르지 않고 "too_long"(라우트가 400 `moim_join_answer_too_long`).
 */
export function readMoimJoinAnswers(v: unknown): string[] | "too_long" | undefined {
  if (!Array.isArray(v)) return undefined;
  const list = v.map((a) => (typeof a === "string" ? a : "")).slice(0, 3);
  return list.some((a) => a.length > MOIM_JOIN_ANSWER_MAX) ? "too_long" : list;
}
