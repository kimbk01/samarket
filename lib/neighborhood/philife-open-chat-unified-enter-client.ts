import { philifeMeetingApi } from "@domain/philife/api";

function parseJoinJson(
  raw: string,
  res: Response
): { ok: false; msg: string; needsLogin?: boolean } | { ok: true; j: Record<string, unknown> } {
  if (!raw.trim()) {
    if (res.status === 401) {
      return { ok: false, msg: "로그인이 필요합니다.", needsLogin: true };
    }
    return { ok: false, msg: "서버 응답이 비어 있습니다." };
  }
  try {
    return { ok: true, j: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      msg:
        res.status === 401
          ? "로그인이 필요합니다."
          : "서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      needsLogin: res.status === 401,
    };
  }
}

export type PhilifeOpenChatUnifiedEnterInput = {
  meetingId: string;
  defaultRoomId: string;
  openChatRoomHasPassword: boolean;
  openChatRoomNeedsApprovalIntro: boolean;
  openNickname: string;
  roomPassword: string;
  introMessage: string;
};

export type PhilifeOpenChatUnifiedEnterResult =
  | { ok: true; roomId: string }
  | { ok: false; error: string; needsLogin?: boolean }
  | { ok: false; meetingPending: true; message: string }
  | { ok: false; chatPendingApproval: true };

/** MeetingJoinButton.runOpenChatUnifiedEnter 와 동일 API 순서 (클라이언트 전용). */
export async function philifeOpenChatUnifiedEnterClient(
  input: PhilifeOpenChatUnifiedEnterInput
): Promise<PhilifeOpenChatUnifiedEnterResult> {
  const mApi = philifeMeetingApi(input.meetingId);
  const rid = input.defaultRoomId.trim();
  const nick = String(input.openNickname ?? "").trim();
  if (!rid) return { ok: false, error: "채팅방 정보를 찾을 수 없습니다." };
  if (!nick) return { ok: false, error: "닉네임을 입력해 주세요." };

  let res: Response;
  try {
    res = await fetch(mApi.join(), { method: "POST", credentials: "include" });
  } catch {
    return { ok: false, error: "네트워크 오류로 요청하지 못했습니다." };
  }
  const raw = await res.text();
  const parsed = parseJoinJson(raw, res);
  if (!parsed.ok) {
    return { ok: false, error: parsed.msg, needsLogin: parsed.needsLogin };
  }
  const j = parsed.j as {
    ok?: boolean;
    error?: string;
    pending?: boolean;
    alreadyPending?: boolean;
  };
  if (res.status === 401) {
    return { ok: false, error: "로그인이 필요합니다.", needsLogin: true };
  }
  if (j.error === "already_pending") {
    return {
      ok: false,
      meetingPending: true,
      message: "이미 신청이 접수된 상태입니다. 운영자 승인을 기다려 주세요.",
    };
  }
  if (!res.ok || !j.ok) {
    const msg =
      j.error === "full"
        ? "인원이 가득 찼습니다."
        : j.error === "closed"
          ? "모집이 마감되었어요."
          : j.error === "meeting_banned"
            ? "이 오픈채팅에는 다시 참여할 수 없습니다."
            : j.error === "invalid_password"
              ? "비밀번호가 올바르지 않습니다."
              : j.error ?? "참여할 수 없습니다.";
    return { ok: false, error: msg };
  }
  if (j.pending || j.alreadyPending) {
    return {
      ok: false,
      meetingPending: true,
      message: "신청이 접수되어 운영자에게 전달되었습니다. 승인되면 오픈채팅방에 입장할 수 있어요.",
    };
  }

  let ocRes: Response;
  try {
    ocRes = await fetch(
      `/api/community/meetings/${encodeURIComponent(input.meetingId)}/meeting-open-chat/rooms/${encodeURIComponent(rid)}/join`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openNickname: nick,
          joinPassword: input.openChatRoomHasPassword ? input.roomPassword : undefined,
          introMessage: input.openChatRoomNeedsApprovalIntro ? input.introMessage || null : null,
        }),
      }
    );
  } catch {
    return { ok: false, error: "채팅방 입장 요청에 실패했습니다." };
  }
  const ocRaw = await ocRes.text();
  let ocj: {
    ok?: boolean;
    error?: string;
    joined?: boolean;
    pendingApproval?: boolean;
  } = {};
  if (ocRaw.trim()) {
    try {
      ocj = JSON.parse(ocRaw) as typeof ocj;
    } catch {
      return { ok: false, error: "채팅방 응답을 처리하지 못했습니다." };
    }
  }
  if (!ocRes.ok || !ocj.ok) {
    const err =
      ocj.error === "invalid_password" || ocj.error === "open_nickname_required"
        ? ocj.error === "invalid_password"
          ? "방 비밀번호가 올바르지 않습니다."
          : "닉네임을 입력해 주세요."
        : ocj.error ?? "채팅방 입장에 실패했습니다.";
    return { ok: false, error: err };
  }
  if (ocj.pendingApproval) {
    return { ok: false, chatPendingApproval: true };
  }
  return { ok: true, roomId: rid };
}
