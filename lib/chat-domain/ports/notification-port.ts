import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";

export type ChatDomainNotificationRoom = Readonly<{
  roomId: string;
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
}>;

export type ChatDomainNotificationPort = Readonly<{
  domain: ChatDomain;
  eventType: NotificationEventType;
  acceptRoom: <T extends ChatDomainNotificationRoom>(room: T) => T;
  resolveMessageEventType: (mentioned: boolean) => NotificationEventType;
}>;
