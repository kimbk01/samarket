/**
 * Phase 3-1 — in-process NotificationEvent log (append + replay).
 */

import type { NotificationEvent } from "@/lib/notifications/engine/notification-event";

export type NotificationEventLogEntry = {
  seq: number;
  event: NotificationEvent;
  recordedAt: string;
  source: "live" | "replay";
};

const liveLog: NotificationEventLogEntry[] = [];
let nextSeq = 1;

export function resetNotificationEventLogForTests(): void {
  liveLog.length = 0;
  nextSeq = 1;
}

export async function appendNotificationEventLog(
  event: NotificationEvent,
  source: NotificationEventLogEntry["source"] = "live"
): Promise<NotificationEventLogEntry> {
  const entry: NotificationEventLogEntry = {
    seq: nextSeq++,
    event,
    recordedAt: new Date().toISOString(),
    source,
  };
  liveLog.push(entry);
  return entry;
}

export function getNotificationEventLogSnapshot(): readonly NotificationEventLogEntry[] {
  return liveLog;
}

export async function* replayNotificationEventLog(
  fromSeq = 1
): AsyncGenerator<NotificationEventLogEntry> {
  for (const entry of liveLog) {
    if (entry.seq >= fromSeq) yield entry;
  }
}

export function latestNotificationEventLogEntry(
  viewerUserId?: string
): NotificationEventLogEntry | null {
  if (!viewerUserId?.trim()) {
    return liveLog.length ? liveLog[liveLog.length - 1]! : null;
  }
  const uid = viewerUserId.trim();
  for (let i = liveLog.length - 1; i >= 0; i -= 1) {
    const entry = liveLog[i]!;
    if (entry.event.userId === uid) return entry;
  }
  return null;
}
