export function isNotificationReadDeferredChatRoomPath(pathname: string): boolean {
  return /^\/community-messenger\/rooms\/[^/?#]+/.test(pathname) || /^\/chats\/[^/?#]+/.test(pathname);
}
