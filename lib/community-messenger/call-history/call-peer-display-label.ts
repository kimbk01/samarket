import { incomingCallPeerNicknameLabel, labelFromDisplayAndUsername } from "@/lib/users/user-label";

export function peerPublicIdFromSubtitle(subtitle: string | null | undefined): string | null {
  const raw = typeof subtitle === "string" ? subtitle.trim().replace(/^@+/, "") : "";
  return raw || null;
}

/** 통화 목록·상대 상세 — `닉네임 (@아이디)` (동일 시 닉네임만) */
export function buildCallPeerDisplayLabel(args: {
  peerLabel: string;
  peerPublicId?: string | null;
}): string {
  const nickname = incomingCallPeerNicknameLabel(args.peerLabel?.trim());
  const formatted = labelFromDisplayAndUsername(nickname, args.peerPublicId);
  if (formatted.trim()) return formatted.trim();
  if (nickname) return nickname;
  const id = args.peerPublicId?.trim().replace(/^@+/, "");
  return id ? `@${id}` : "";
}
