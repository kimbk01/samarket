import type { ChatMessage } from "@/lib/types/chat";

/** 폴링·낙관적 전송이 겹쳐도 id 기준으로 합쳐 유실 방지 */
export function mergeChatMessagesById(prev: ChatMessage[], next: ChatMessage[]): ChatMessage[] {
  if (next.length === 0) return prev;
  const byId = new Map<string, ChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of next) byId.set(m.id, m);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
