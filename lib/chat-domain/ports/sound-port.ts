import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";

export type ChatDomainSoundRoom = Readonly<{
  roomId: string;
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
}>;

export type ChatDomainSoundContext = Readonly<{
  eventType?: NotificationEventType;
  receiverRole?: "owner" | "user" | "member";
}>;

export type ChatDomainSoundResolution = Readonly<{
  eventKey: string;
  notificationEventType: NotificationEventType;
}>;

export type ChatDomainSoundPort = Readonly<{
  domain: ChatDomain;
  defaultEventType: NotificationEventType;
  acceptRoom: <T extends ChatDomainSoundRoom>(room: T) => T;
  resolveMessageSound: (context?: ChatDomainSoundContext) => ChatDomainSoundResolution;
}>;
