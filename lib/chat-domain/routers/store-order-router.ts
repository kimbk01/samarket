import {
  buildChatDomainRoomHref,
  type ChatDomainRouterPort,
} from "@/lib/chat-domain/ports/router-port";

export const storeOrderRouter: ChatDomainRouterPort = {
  domain: "store_order",
  buildRoomHref: (input) => buildChatDomainRoomHref("store_order", input),
};
