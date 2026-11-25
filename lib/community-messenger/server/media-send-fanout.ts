/**
 * F3(2026-11-25) 사진·동영상 보내기 — 저장 뒤 알림·배지·방 bump 를 글 보내기(`POST …/messages`)와 같은 순서·함수로.
 * 설계: docs/audit/supabase-request-surge-2026-11-18/media-send-fanout-f3-design-2026-11-25.md
 *
 * 순서(글 보내기 라우트 P2 와 같음):
 *  ① 배지 target bump(병렬 함수, 송신 가드가 읽은 방 정보·전송 RPC 받는 사람 재사용) ‖ 알림 이벤트 응답 전 저장
 *  ② target 완료 → 알림 저장 완료
 *  ③ 방 bump(`publishTextSendRoomBump` — 방·참가자 재조회 없음)는 응답 뒤(after)
 *  ④ 자동 읽음은 target 뒤
 *  ⑤ 응답 뒤(after) 푸시 — 받는 사람 사실 미리 읽기·동시 8
 * 배지·홈 목록 사본은 효과 함수 안에서 「바뀜 표시」 1번(받는 사람마다 즉시 재생성 안 함).
 *
 * 서비스 클라이언트가 없으면 예전 경로(예전 알림 함수 + 예전 방 bump)로 — 알림을 빠뜨리지 않는다.
 */
import { after } from "next/server";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import type { CommunityMessengerMediaSendFanout } from "@/lib/community-messenger/service";

function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(async () => {
      await task().catch(() => undefined);
    });
  } catch {
    /* 요청 스코프 밖(스크립트·시험) — 바로 실행 */
    void task().catch(() => undefined);
  }
}

export async function runMediaSendFanoutAfterCommit(input: {
  rawRouteRoomId: string;
  canonicalRoomId: string;
  userId: string;
  message: CommunityMessengerMessage;
  fanout: CommunityMessengerMediaSendFanout;
}): Promise<void> {
  const { canonicalRoomId, userId, message, fanout } = input;
  const room = fanout.room;
  const recipientUserIds = fanout.recipientUserIds;
  const bumpArgs = {
    rawRouteRoomId: input.rawRouteRoomId,
    canonicalRoomId,
    fromUserId: userId,
    messageId: message.id,
    messageCreatedAt: message.createdAt,
    messageForBump: message,
    prefetched: {
      roomType: room.roomType,
      chatDomain: room.chatDomain,
      domainIdentity: room.domainIdentity,
      recipientUserIds,
    },
  };

  const { resolveServiceSupabaseForApi } = await import("@/lib/supabase/resolve-service-supabase-for-api");
  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    const [{ notifyCommunityMessengerMessageRecipients }, { getSupabaseServer }, { publishMessengerRoomBumpAfterMutation }] =
      await Promise.all([
        import("@/lib/community-messenger/service"),
        import("@/lib/chat/supabase-server"),
        import("@/lib/community-messenger/server/publish-messenger-room-bump"),
      ]);
    const notifyDone = notifyCommunityMessengerMessageRecipients(getSupabaseServer() as never, {
      roomId: canonicalRoomId,
      messageId: message.id,
      senderUserId: userId,
      preview: fanout.previewText,
      recipientUserIds,
    });
    runAfterResponse(() => notifyDone);
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: input.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: userId,
      messageId: message.id,
      messageCreatedAt: message.createdAt,
      messageForBump: message,
    }).catch(() => undefined);
    return;
  }

  const [{ bumpMessengerRoomTargetsForRecipientsParallel }, effectsMod] = await Promise.all([
    import("@/lib/notifications/notification-target-messenger-bridge"),
    import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects"),
  ]);

  const targetPromise = bumpMessengerRoomTargetsForRecipientsParallel(sb, {
    roomId: canonicalRoomId,
    fromUserId: userId,
    known: {
      roomType: room.roomType,
      chatDomain: room.chatDomain,
      directKey: room.directKey,
      recipientUserIds,
    },
  });
  targetPromise.catch(() => undefined);
  const durablePromise = effectsMod
    .runCommunityMessengerSendDurablePreAckEffects(
      sb,
      {
        roomId: canonicalRoomId,
        senderUserId: userId,
        content: message.content,
        recipientUserIds,
        createdAt: message.createdAt,
        itemTradeLedgerId: null,
        messageId: message.id,
        chatDomain: room.chatDomain,
        roomType: room.roomType,
        domainIdentity: room.domainIdentity,
        directKey: room.directKey,
        mediaSend: { previewText: fanout.previewText },
      },
      undefined,
      { parallelRecipients: true, deferAutoRead: true }
    )
    .catch(() => null);

  try {
    await targetPromise;
  } catch {
    /* best-effort — target 실패가 알림·bump 를 막지 않는다 */
  }
  const deferred = await durablePromise;

  runAfterResponse(async () => {
    const { publishTextSendRoomBump } = await import("@/lib/community-messenger/server/publish-text-send-room-bump");
    await publishTextSendRoomBump(bumpArgs);
  });

  const autoReadIds = deferred?.autoReadRecipientIds ?? [];
  if (autoReadIds.length > 0) {
    const { markRoomRead } = await import("@/lib/notifications/pipeline/notify-read-service");
    await Promise.all(autoReadIds.map((rid) => markRoomRead(sb, rid, canonicalRoomId).catch(() => undefined)));
  }

  if (deferred) {
    runAfterResponse(() => effectsMod.runCommunityMessengerSendDeferredPostAckEffects(sb, deferred));
  }
}
