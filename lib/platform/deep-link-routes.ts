/**
 * dibay:// deep link ↔ in-app HTTPS path (single source).
 */

import { buildCommunityPostNotificationPath } from "@/lib/notifications/community-post-notification-destination";

export type DibayDeepLinkKind =
  | "chat"
  | "trade_chat"
  | "order"
  | "community_post"
  | "call"
  | "call_v4"
  | "auth";

const SCHEME = "dibay://";

export function buildDibayDeepLink(kind: DibayDeepLinkKind, id: string): string {
  const raw = id.trim();
  switch (kind) {
    case "chat":
      return `${SCHEME}chat/${encodeURIComponent(raw)}`;
    case "trade_chat":
      return `${SCHEME}trade/chat/${encodeURIComponent(raw)}`;
    case "order":
      return `${SCHEME}orders/${encodeURIComponent(raw)}`;
    case "community_post":
      return `${SCHEME}community/post/${encodeURIComponent(raw)}`;
    case "call":
      return `${SCHEME}call/${encodeURIComponent(raw)}`;
    case "call_v4":
      return `${SCHEME}call-v4/${encodeURIComponent(raw)}`;
    case "auth":
      return `${SCHEME}auth/callback`;
    default:
      return `${SCHEME}`;
  }
}

export function resolveDibayDeepLinkToAppPath(deepLink: string): string | null {
  const trimmed = deepLink.trim();
  if (!trimmed.startsWith(SCHEME)) return null;
  const queryIndex = trimmed.indexOf("?");
  const withoutQuery = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed;
  const query = queryIndex >= 0 ? trimmed.slice(queryIndex) : "";
  const rest = withoutQuery.slice(SCHEME.length);
  const [head, ...tailParts] = rest.split("/").filter(Boolean);
  const tail = tailParts.map((p) => decodeURIComponent(p)).join("/");

  switch (head) {
    case "chat":
      return tail ? `/community-messenger/rooms/${encodeURIComponent(tail)}${query}` : null;
    case "trade": {
      if (tailParts[0] === "chat" && tailParts[1]) {
        return `/chats/${encodeURIComponent(decodeURIComponent(tailParts[1]))}${query}`;
      }
      return null;
    }
    case "orders":
      return tail ? `/orders/store/${encodeURIComponent(tail)}${query}` : null;
    case "community":
      if (tailParts[0] === "post" && tailParts[1]) {
        return `${buildCommunityPostNotificationPath(decodeURIComponent(tailParts[1]))}${query}`;
      }
      return null;
    case "call": {
      const sessionId = tailParts[0] ? decodeURIComponent(tailParts[0]) : "";
      return sessionId ? `/community-messenger/calls/${encodeURIComponent(sessionId)}${query}` : null;
    }
    case "call-v4": {
      const sessionId = tailParts[0] ? decodeURIComponent(tailParts[0]) : "";
      return sessionId ? `/community-messenger/calls-v4/${encodeURIComponent(sessionId)}${query}` : null;
    }
    case "auth":
      return "/auth/callback";
    default:
      return null;
  }
}

export function resolveAppPathToDibayDeepLink(appPath: string): string | null {
  const path = appPath.trim();
  const cmRoom = /^\/community-messenger\/rooms\/([^/?#]+)/.exec(path);
  if (cmRoom?.[1]) return buildDibayDeepLink("chat", decodeURIComponent(cmRoom[1]));

  const tradeChat = /^\/chats\/([^/?#]+)/.exec(path);
  if (tradeChat?.[1]) return buildDibayDeepLink("trade_chat", decodeURIComponent(tradeChat[1]));

  const order = /^\/orders\/store\/([^/?#]+)/.exec(path);
  if (order?.[1]) return buildDibayDeepLink("order", decodeURIComponent(order[1]));

  const communityPost = /^\/community\/posts\/([^/?#]+)/.exec(path);
  if (communityPost?.[1]) {
    return buildDibayDeepLink("community_post", decodeURIComponent(communityPost[1]));
  }

  // Legacy poisoned path — still reverse-map so old payloads round-trip to dibay://
  const legacyPhilifePosts = /^\/philife\/posts\/([^/?#]+)/.exec(path);
  if (legacyPhilifePosts?.[1]) {
    return buildDibayDeepLink("community_post", decodeURIComponent(legacyPhilifePosts[1]));
  }

  const call = /^\/community-messenger\/calls\/([^/?#]+)/.exec(path);
  if (call?.[1]) return buildDibayDeepLink("call", decodeURIComponent(call[1]));

  const callV4 = /^\/community-messenger\/calls-v4\/([^/?#]+)/.exec(path);
  if (callV4?.[1]) return buildDibayDeepLink("call_v4", decodeURIComponent(callV4[1]));

  return null;
}
