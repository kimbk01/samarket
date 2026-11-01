/** 어드민 「알림 항목 관리」 한 줄 — 서버(GET/PUT 응답)·화면 공용 타입. */
import type { NotificationItemDefinition } from "@/lib/notifications/notification-item-registry";

export type NotificationItemAdminRow = {
  key: string;
  labelKo: string;
  labelEn: string;
  audience: NotificationItemDefinition["audience"];
  group: NotificationItemDefinition["group"];
  soundEventKey: string | null;
  pushLock: NotificationItemDefinition["pushLock"];
  inboxLock: NotificationItemDefinition["inboxLock"];
  legacyOnly: boolean;
  pushEnabled: boolean;
  inboxEnabled: boolean;
  revision: number | null;
  updatedAt: string | null;
  preference: { domain: string; mandatory: boolean } | null;
  bellDomain: string | null;
  stats: {
    created: number;
    pushSent: number;
    suppressed: Record<string, number>;
    lastAt: string | null;
  };
};
