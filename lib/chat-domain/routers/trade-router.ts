import {
  buildChatDomainRoomHref,
  type ChatDomainRouterPort,
} from "@/lib/chat-domain/ports/router-port";

export const tradeRouter: ChatDomainRouterPort = {
  domain: "trade",
  buildRoomHref: (input) => buildChatDomainRoomHref("trade", input),
};
