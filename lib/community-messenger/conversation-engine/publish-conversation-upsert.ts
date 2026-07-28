import { isChatDomain } from "@/lib/chat-domain/chat-domain";
import { publishCommunityMessengerConversationUpsertFromServer } from "@/lib/community-messenger/conversation-engine/conversation-upsert-broadcast-server";
import type { ConversationUpsertBroadcastPayload } from "@/lib/community-messenger/conversation-engine/conversation-upsert-channel";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

function revisionFromIso(iso: string): number {
  const ms = new Date(String(iso ?? "")).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * After room tip write (message send / call stub) — emit conversation_upsert for list engine.
 */
export async function publishConversationUpsertAfterTipWrite(args: {
  roomId: string;
  eventId: string;
  lastActivityAt: string;
  previewText: string;
  previewKind: "text" | "image" | "file" | "system" | "call" | "voice" | "sticker" | "community_post_share";
  messageId?: string | null;
  callStatus?: string | null;
  sessionId?: string | null;
  callId?: string | null;
}): Promise<void> {
  const roomId = String(args.roomId ?? "").trim();
  if (!roomId || !args.eventId) return;

  let domain = "general_direct";
  let domainIdentityKey: string | null = null;
  try {
    const sb = getSupabaseServer();
    const { data } = await sb
      .from("community_messenger_rooms")
      .select("chat_domain, domain_identity, domain_identity_key, room_type")
      .eq("id", roomId)
      .maybeSingle();
    const row = data as {
      chat_domain?: string | null;
      domain_identity?: string | null;
      domain_identity_key?: string | null;
      room_type?: string | null;
    } | null;
    const raw = String(row?.chat_domain ?? "").trim();
    if (isChatDomain(raw)) domain = raw;
    else if (String(row?.room_type ?? "") === "group") domain = "group";
    domainIdentityKey =
      String(row?.domain_identity_key ?? "").trim() ||
      String(row?.domain_identity ?? "").trim() ||
      null;
  } catch {
    /* best-effort domain */
  }

  const payload: ConversationUpsertBroadcastPayload = {
    v: 1,
    eventId: args.eventId,
    roomId,
    canonicalRoomId: roomId,
    domain,
    lastActivityAt: args.lastActivityAt,
    revision: revisionFromIso(args.lastActivityAt),
    preview: {
      kind: args.previewKind,
      text: args.previewText,
      messageId: args.messageId ?? null,
      callStatus: args.callStatus ?? null,
      sessionId: args.sessionId ?? null,
      callId: args.callId ?? null,
    },
    chatDomain: domain,
    domainIdentityKey,
  };

  await publishCommunityMessengerConversationUpsertFromServer(payload);
}
