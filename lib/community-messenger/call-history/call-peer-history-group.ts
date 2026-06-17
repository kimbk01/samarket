import { resolveCallLogListTimestampIso } from "@/lib/community-messenger/call-log-row-copy";
import { sortCallHistoryEntries } from "@/lib/community-messenger/call-history/call-history-sorter";
import type { CommunityMessengerCallLog } from "@/lib/community-messenger/types";

export type CallPeerHistorySectionKind = "today" | "yesterday" | "date";

export type CallPeerHistorySection = {
  sectionKey: string;
  sectionKind: CallPeerHistorySectionKind;
  calls: CommunityMessengerCallLog[];
};

export const CALL_PEER_HISTORY_INITIAL_LIMIT = 20;

export function filterDirectCallHistoryForPeer(
  calls: CommunityMessengerCallLog[],
  peerUserId: string,
  roomId?: string | null
): CommunityMessengerCallLog[] {
  const peer = peerUserId.trim();
  const room = roomId?.trim() || (peer.startsWith("room:") ? peer.slice(5).trim() : null);
  if (!peer && !room) return [];
  return sortCallHistoryEntries(
    calls.filter((call) => {
      if (call.sessionMode === "group") return false;
      if (peer && !peer.startsWith("room:") && call.peerUserId?.trim() === peer) return true;
      if (room && call.roomId?.trim() === room) return true;
      return false;
    })
  );
}

function resolveCallPeerHistoryDayKey(call: CommunityMessengerCallLog): string {
  const iso = resolveCallLogListTimestampIso(call);
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return date.toDateString();
}

function resolveCallPeerHistorySectionKind(dayKey: string): CallPeerHistorySectionKind {
  if (dayKey === "unknown") return "date";
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey === now.toDateString()) return "today";
  if (dayKey === yesterday.toDateString()) return "yesterday";
  return "date";
}

export function groupCallPeerHistoryByDate(calls: CommunityMessengerCallLog[]): CallPeerHistorySection[] {
  const sections: CallPeerHistorySection[] = [];
  let current: CallPeerHistorySection | null = null;

  for (const call of calls) {
    const sectionKey = resolveCallPeerHistoryDayKey(call);
    if (!current || current.sectionKey !== sectionKey) {
      current = {
        sectionKey,
        sectionKind: resolveCallPeerHistorySectionKind(sectionKey),
        calls: [],
      };
      sections.push(current);
    }
    current.calls.push(call);
  }

  return sections;
}
