import {
  prewarmChatRouteData,
  shouldWarmChatRoute,
} from "@/lib/chats/prewarm-chat-room-route";

type MinimalRouterForPrefetch = {
  prefetch: (href: string) => void | Promise<void>;
};

/** 인박스 항목 href가 채팅 방이면 라우트·부트스트랩 선기동 */
export function prewarmInboxNotificationChatHref(
  router: MinimalRouterForPrefetch,
  href: string
): void {
  if (!shouldWarmChatRoute(href)) return;
  void router.prefetch(href);
  prewarmChatRouteData(href);
}
