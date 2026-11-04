/**
 * 메신저 신고 대상 검증 — `POST /api/community-messenger/reports` 전용.
 *
 * - 방·메시지 신고는 신고자가 그 방의 활성 참가자일 때만 받는다(canonical 방 확인 = 강퇴·나감 즉시 반영).
 * - 메시지는 그 방에 속한 것만, 피신고자는 서버가 메시지 발신자로 정한다(클라이언트 값 무시).
 * - 권한 없음·없는 방/메시지·삭제된 메시지는 모두 같은 404 로 답해 존재 여부를 알려주지 않는다.
 * - 탈퇴한 신고자는 403. 탈퇴한 회원의 계정 신고는 404(제재 대상 계정 없음). 탈퇴 회원이 남긴 메시지는 신고 가능.
 */
import { isWithdrawnMemberAccount, type MemberAccountProfileLike } from "@/lib/auth/member-account-state";

export type MessengerReportType = "room" | "message" | "user";

export type MessengerReportMessageRow = {
  sender_id: string | null;
  deleted_at: string | null;
  deleted_for_everyone_at: string | null;
};

export type MessengerReportTargetDeps = {
  /** 신고자가 활성 참가자인 방의 canonical id, 아니면 null. */
  resolveMemberRoomId: (userId: string, rawRoomId: string) => Promise<string | null>;
  loadMessage: (roomId: string, messageId: string) => Promise<MessengerReportMessageRow | null>;
  /** 그 방에 참가 기록(나간 기록 포함)이 있는지. */
  hasParticipantRow: (roomId: string, userId: string) => Promise<boolean>;
  loadProfile: (userId: string) => Promise<(MemberAccountProfileLike & { id?: string | null }) | null>;
};

export type MessengerReportTargetInput = {
  reporterUserId: string;
  reportType: MessengerReportType;
  roomId?: unknown;
  messageId?: unknown;
  reportedUserId?: unknown;
};

export type MessengerReportTargetResult =
  | { ok: true; roomId: string | null; messageId: string | null; reportedUserId: string | null }
  | { ok: false; status: number; error: string };

export const MESSENGER_REPORT_TARGET_NOT_FOUND = "report_target_not_found";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const notFound = (): MessengerReportTargetResult => ({
  ok: false,
  status: 404,
  error: MESSENGER_REPORT_TARGET_NOT_FOUND,
});

export async function resolveMessengerReportTarget(
  input: MessengerReportTargetInput,
  deps: MessengerReportTargetDeps
): Promise<MessengerReportTargetResult> {
  const reporter = str(input.reporterUserId);
  const rawRoomId = str(input.roomId);
  const messageId = str(input.messageId);
  const reportedRaw = str(input.reportedUserId);

  const reporterProfile = await deps.loadProfile(reporter);
  if (isWithdrawnMemberAccount(reporterProfile)) {
    return { ok: false, status: 403, error: "account_withdrawn" };
  }

  if (input.reportType === "message") {
    if (!rawRoomId || !messageId) return { ok: false, status: 400, error: "missing_target" };
    if (!UUID_RE.test(messageId)) return notFound();
    const roomId = await deps.resolveMemberRoomId(reporter, rawRoomId);
    if (!roomId) return notFound();
    const msg = await deps.loadMessage(roomId, messageId);
    if (!msg || msg.deleted_at || msg.deleted_for_everyone_at) return notFound();
    const sender = str(msg.sender_id);
    if (!sender) return notFound();
    if (sender === reporter) return { ok: false, status: 400, error: "cannot_report_self" };
    return { ok: true, roomId, messageId, reportedUserId: sender };
  }

  if (input.reportType === "room") {
    if (!rawRoomId) return { ok: false, status: 400, error: "missing_target" };
    const roomId = await deps.resolveMemberRoomId(reporter, rawRoomId);
    if (!roomId) return notFound();
    if (!reportedRaw) return { ok: true, roomId, messageId: null, reportedUserId: null };
    if (!UUID_RE.test(reportedRaw)) return notFound();
    if (reportedRaw === reporter) return { ok: false, status: 400, error: "cannot_report_self" };
    if (!(await deps.hasParticipantRow(roomId, reportedRaw))) return notFound();
    return { ok: true, roomId, messageId: null, reportedUserId: reportedRaw };
  }

  if (!reportedRaw) return { ok: false, status: 400, error: "missing_target" };
  if (!UUID_RE.test(reportedRaw)) return notFound();
  if (reportedRaw === reporter) return { ok: false, status: 400, error: "cannot_report_self" };
  const target = await deps.loadProfile(reportedRaw);
  if (!target?.id || isWithdrawnMemberAccount(target)) return notFound();
  if (!rawRoomId) return { ok: true, roomId: null, messageId: null, reportedUserId: reportedRaw };
  const roomId = await deps.resolveMemberRoomId(reporter, rawRoomId);
  if (!roomId) return notFound();
  if (!(await deps.hasParticipantRow(roomId, reportedRaw))) return notFound();
  return { ok: true, roomId, messageId: null, reportedUserId: reportedRaw };
}
