import { publishCommunityMessengerRoomBumpFromServer } from "@/lib/community-messenger/realtime/room-bump-broadcast-server";
import { invalidateRoomBootstrapSnapshotCache } from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { invalidateRoomBootstrapRouteCacheForRoom } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateHomeSyncSnapshotCache } from "@/lib/community-messenger/home-sync-snapshot-cache";
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

/**
 * P2 (Owner 2026-11-18 「권장안대로」, 레거시 Telegram 기준) — 음성 메시지 영구 삭제 뒤 상대 열린 방에서도
 * 즉시 사라지게 한다(묘비 없음).
 *
 * - 캐시: 방 라우트·부트스트랩 캐시 + 참가자 목록·배지 캐시 무효화(방 미리보기를 다시 계산했으므로 —
 *   「모두에게서 삭제」 N-3 와 같은 대상).
 * - 발행: 공용 발행기 **호출만** + 선택 필드 `messageAction: "hard_deleted"` — 수신 측은 그 id 행을 로컬에서 제거,
 *   단건 GET(404 14회 재시도)을 하지 않는다. 구 클라이언트는 필드를 무시하고 기존 경로(단건 GET 실패 → after=)로 간다.
 * - `eventIdentity` 를 `hard_deleted:<id>` 로 둬 같은 id 의 전송 bump 와 dedupe 키가 겹치지 않게 한다.
 * `publish-messenger-room-bump.ts`(통화 기록 경로 공유)는 수정하지 않는다(I7).
 */
export async function publishMessageHardDeletedRoomBump(args: {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  fromUserId: string;
  messageId: string;
}): Promise<void> {
  const raw = args.rawRouteRoomId.trim();
  const canon = args.canonicalRoomId.trim();
  const fromUserId = args.fromUserId.trim();
  const messageId = args.messageId.trim();
  if (!canon || !fromUserId || !messageId) return;
  invalidateRoomBootstrapRouteCacheForRoom(canon);
  if (raw && raw !== canon) invalidateRoomBootstrapRouteCacheForRoom(raw);

  let participantIds: string[] = [fromUserId];
  try {
    const sb = getSupabaseServer();
    const { data } = await sb.from("community_messenger_participants").select("user_id").eq("room_id", canon);
    const ids = (data ?? [])
      .map((row) =>
        row && typeof row === "object" && typeof (row as { user_id?: unknown }).user_id === "string"
          ? (row as { user_id: string }).user_id.trim()
          : ""
      )
      .filter(Boolean);
    participantIds = [...new Set([fromUserId, ...ids])];
  } catch {
    /* 참가자 조회 실패 — 보낸 사람 캐시만 무효화 */
  }
  invalidateRoomBootstrapSnapshotCache(canon, participantIds);
  for (const uid of participantIds) {
    invalidateOwnerHubBadgeCache(uid);
    invalidateHomeSyncSnapshotCache(uid);
    invalidateCmBootstrapSnapshotCache(uid);
    invalidateFullBootstrapSnapshotCache(uid, "peer_hub_invalidate");
  }

  const rawTagged = raw && raw.toLowerCase() !== canon.toLowerCase() ? raw : "";
  const base = {
    canonicalRoomId: canon,
    fromUserId,
    messageId,
    messageAction: "hard_deleted" as const,
    eventIdentity: `hard_deleted:${messageId}`,
  };
  await publishCommunityMessengerRoomBumpFromServer({
    ...base,
    channelRoomId: canon,
    rawRouteRoomId: rawTagged || null,
  });
  if (rawTagged) {
    await publishCommunityMessengerRoomBumpFromServer({
      ...base,
      channelRoomId: raw,
      rawRouteRoomId: rawTagged,
    });
  }
}
