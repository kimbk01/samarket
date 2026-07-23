import {
  buildChatDomainRoomHref,
  type ChatDomainRouterPort,
} from "@/lib/chat-domain/ports/router-port";

export const generalDirectRouter: ChatDomainRouterPort = {
  domain: "general_direct",
  buildRoomHref: (input) => buildChatDomainRoomHref("general_direct", input),
};
