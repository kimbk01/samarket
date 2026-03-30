/** 가입 신청 본문 — 모달에서 조합해 `meeting_join_requests.request_message`에 저장 */

export type MeetingJoinRequestParts = {
  nickname: string;
  intro: string;
  reason: string;
  note: string;
};

const HEADER = "[모임 가입 요청]";

export function formatMeetingJoinRequestMessage(parts: MeetingJoinRequestParts): string {
  const nick = parts.nickname.replace(/\s+/g, " ").trim() || "(미입력)";
  const intro = parts.intro.replace(/\s+/g, " ").trim() || "(미입력)";
  const reason = parts.reason.replace(/\s+/g, " ").trim() || "(미입력)";
  const note = parts.note.replace(/\s+/g, " ").trim() || "(미입력)";
  return [
    HEADER,
    `닉네임: ${nick}`,
    `소개: ${intro}`,
    `참여 이유: ${reason}`,
    `메모: ${note}`,
  ].join("\n");
}

/** 관리 화면용 — 위 포맷이면 필드별로 분해 */
export function parseMeetingJoinRequestMessage(raw: string): MeetingJoinRequestParts | null {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t.startsWith(HEADER)) return null;
  const pick = (prefix: string): string => {
    const line = t.split("\n").find((l) => l.startsWith(prefix));
    if (!line) return "";
    return line.slice(prefix.length).trim();
  };
  return {
    nickname: pick("닉네임:"),
    intro: pick("소개:"),
    reason: pick("참여 이유:"),
    note: pick("메모:"),
  };
}
