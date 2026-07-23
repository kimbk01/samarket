import {
  buildChatDomainRoomHref,
  type ChatDomainRouterPort,
} from "@/lib/chat-domain/ports/router-port";

export const groupRouter: ChatDomainRouterPort = {
  domain: "group",
  buildRoomHref: (input) => buildChatDomainRoomHref("group", input),
};
