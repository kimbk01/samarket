/**
 * Philife/모임 `meetingId` 딥링크 — API 한 곳에서 room·게시글 id 를 해석한다.
 * 커뮤니티 피드(레거시)·메신저 홈이 동일 계약을 쓴다.
 */
export type MeetingDeeplinkResolve = { kind: "room"; roomId: string } | { kind: "post"; postId: string } | { kind: "none" };

export async function fetchMeetingDeeplink(
  meetingId: string,
  signal?: AbortSignal
): Promise<MeetingDeeplinkResolve> {
  const id = String(meetingId ?? "").trim();
  if (!id) return { kind: "none" };
  const res = await fetch(`/api/community/meetings/${encodeURIComponent(id)}`, {
    cache: "no-store",
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    meeting?: {
      community_messenger_room_id?: string | null;
      communityMessengerRoomId?: string | null;
      post_id?: string | null;
      postId?: string | null;
    };
  };
  if (!res.ok || !json.ok) return { kind: "none" };
  const m = json.meeting;
  const roomId = String(m?.community_messenger_room_id ?? m?.communityMessengerRoomId ?? "").trim();
  if (roomId) return { kind: "room", roomId };
  const postId = String(m?.post_id ?? m?.postId ?? "").trim();
  if (postId) return { kind: "post", postId };
  return { kind: "none" };
}
