/**
 * C-4 — 관리자 화면(CM 방 상세·주문 채팅 뷰어 등) 첨부 URL 빌더 (client-safe 문자열 함수).
 *
 * 저장된 첨부 URL(레거시 공개 post-images · 비공개 messenger-media)을 사용자와 **같은 조회 라우트**로 바꾼다.
 * `ctx=admin` 이 붙어 서버가 참가자 판정 대신 `chats`(주문 채팅은 `business` 도) 권한·본문 열람 정책·
 * `audit_logs`(chat_room.content_view) 를 적용한 뒤 짧은 서명 URL 로 302 한다.
 * 고스트 열람(연결 근거 없는 1:1·그룹)은 화면에서 받은 사유를 `reason` 으로 넘긴다.
 *
 * 메신저 버킷 저장 URL 이 아니면(외부 URL·빈 값) 입력을 그대로 돌려준다.
 */
import { messengerMediaRouteUrlFor, isMessengerMediaRouteUrl } from "@/lib/community-messenger/media/messenger-media-ref";

export function buildAdminMessengerMediaUrl(input: {
  /** CM 방 id (`community_messenger_rooms.id`) — 레거시 거래 방 id 가 아니다. */
  roomId: string | null | undefined;
  messageId: string | null | undefined;
  /** 메시지에 저장된 첨부 URL (content·metadata 의 이미지/파일/음성 URL) */
  url: string | null | undefined;
  /** 파일 저장용 원본 파일명 (Content-Disposition) */
  download?: string | null;
  /** 고스트 열람 사유 (`reason` 쿼리) */
  reason?: string | null;
}): string {
  const routed = messengerMediaRouteUrlFor({
    roomId: input.roomId,
    messageId: input.messageId,
    src: input.url,
    download: input.download,
    admin: true,
  });
  const reason = String(input.reason ?? "").trim();
  if (!reason || !isMessengerMediaRouteUrl(routed)) return routed;
  return `${routed}&reason=${encodeURIComponent(reason)}`;
}

/** 여러 URL(앨범) 일괄 변환 — 순서 유지. */
export function buildAdminMessengerMediaUrls(input: {
  roomId: string | null | undefined;
  messageId: string | null | undefined;
  urls: ReadonlyArray<string | null | undefined>;
  reason?: string | null;
}): string[] {
  return input.urls.map((url) =>
    buildAdminMessengerMediaUrl({ roomId: input.roomId, messageId: input.messageId, url, reason: input.reason })
  );
}
