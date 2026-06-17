import { formatCommunityMessengerCallDurationLabel } from "@/lib/community-messenger/call-duration-label";
import type { CommunityMessengerCallLog, CommunityMessengerCallLogDisplayType } from "@/lib/community-messenger/types";

export { formatCommunityMessengerCallDurationLabel as formatCallHistoryDuration };

export function formatCallHistoryDurationSeconds(seconds: number): string {
  return formatCommunityMessengerCallDurationLabel(seconds);
}

export function resolveCallHistoryTimestamp(call: Pick<CommunityMessengerCallLog, "startedAt" | "endedAt">): string {
  const started = call.startedAt?.trim();
  if (started) return started;
  return call.endedAt?.trim() || new Date(0).toISOString();
}
