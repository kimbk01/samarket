import type { ConversationSummary } from "@/lib/community-messenger/conversation-engine/types";

function activityMs(iso: string): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** pinned → lastActivityAt DESC → conversationId ASC */
export function sortConversations(rows: readonly ConversationSummary[]): ConversationSummary[] {
  return [...rows].sort((a, b) => {
    if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
      return a.isPinned ? -1 : 1;
    }
    const am = activityMs(a.lastActivityAt);
    const bm = activityMs(b.lastActivityAt);
    if (am !== bm) return bm - am;
    return a.conversationId.localeCompare(b.conversationId);
  });
}
