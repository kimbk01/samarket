import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

/**
 * V-3 — 발신 첫 화면(서버 세션 생성 전) 상대 이름 힌트.
 * 방 제목(`room.title`)은 별칭 등으로 바뀔 수 있어 수신 측 이름과 다를 수 있다 →
 * 방 멤버 중 상대 프로필 라벨을 서버 `mapCallSession` 과 같은 규칙(`incomingCallPeerNicknameLabel`)으로 쓴다.
 * 멤버 정보가 없을 때만 방 제목으로 보조한다.
 */
export function resolveOutgoingCallPeerLabelHint(
  members: ReadonlyArray<{ id: string; label?: string | null }> | null | undefined,
  peerUserId: string | null | undefined,
  roomTitle: string | null | undefined,
): string | undefined {
  const peer = (peerUserId ?? "").trim();
  if (peer && members?.length) {
    const member = members.find((m) => m.id.trim() === peer);
    const label = incomingCallPeerNicknameLabel(member?.label ?? null);
    if (label) return label;
  }
  return roomTitle?.trim() || undefined;
}
