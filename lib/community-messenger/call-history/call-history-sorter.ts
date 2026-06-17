import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";
import { resolveCallHistoryTimestamp } from "@/lib/community-messenger/call-history/call-duration";

export function compareCallHistoryEntries(
  a: Pick<CommunityMessengerCallLog, "startedAt" | "endedAt" | "id">,
  b: Pick<CommunityMessengerCallLog, "startedAt" | "endedAt" | "id">
): number {
  const timeA = new Date(resolveCallHistoryTimestamp(a)).getTime();
  const timeB = new Date(resolveCallHistoryTimestamp(b)).getTime();
  if (timeA !== timeB) return timeB - timeA;
  return b.id.localeCompare(a.id);
}

export function sortCallHistoryEntries<T extends CommunityMessengerCallLog>(calls: T[]): T[] {
  return [...calls].sort(compareCallHistoryEntries);
}
