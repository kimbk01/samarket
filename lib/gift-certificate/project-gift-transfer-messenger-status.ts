import type { SupabaseClient } from "@supabase/supabase-js";
import { GIFT_TABLES } from "@/lib/gift-certificate/gift-certificate-schema";
import type { GiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";

/**
 * After accept/reject/cancel money RPC: best-effort sync of chat card metadata.
 * Never invents ownership — financial RPC already committed.
 */
export async function projectGiftTransferMessengerStatus(
  sb: SupabaseClient,
  args: {
    transferId: string;
    transferStatus: NonNullable<GiftCertificateMessageMetadata["transfer_status"]>;
  }
): Promise<void> {
  const transferId = args.transferId.trim();
  if (!transferId) return;

  const { data: transfer } = await sb
    .from(GIFT_TABLES.transfers)
    .select("messenger_message_id")
    .eq("id", transferId)
    .maybeSingle();
  const messageId = String(
    (transfer as { messenger_message_id?: string | null } | null)?.messenger_message_id ?? ""
  ).trim();
  if (!messageId) return;

  const { data: msg } = await sb
    .from("community_messenger_messages")
    .select("id, metadata")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return;

  const prev =
    msg.metadata && typeof msg.metadata === "object" && !Array.isArray(msg.metadata)
      ? (msg.metadata as Record<string, unknown>)
      : {};
  await sb
    .from("community_messenger_messages")
    .update({
      metadata: {
        ...prev,
        gift_transfer_id: transferId,
        transfer_status: args.transferStatus,
      },
    })
    .eq("id", messageId);
}
