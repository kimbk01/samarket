/**
 * Best-effort dual-write of chat_domain + domain_identity after legacy ensure/create.
 * Silent no-op if migration not yet applied on the target DB.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlannedRoomDomainColumns } from "@/lib/chat-domain/domain-identity-legacy-map";

export async function bestEffortWriteRoomDomainColumns(
  sb: SupabaseClient<any> | null | undefined,
  roomId: string,
  planned: PlannedRoomDomainColumns,
): Promise<"written" | "skipped" | "failed"> {
  const id = roomId.trim();
  if (!sb || !id) return "skipped";
  try {
    const { error } = await sb
      .from("community_messenger_rooms")
      .update({
        chat_domain: planned.chat_domain,
        domain_identity: planned.domain_identity,
      })
      .eq("id", id)
      .is("domain_identity", null);
    if (error) return "failed";
    return "written";
  } catch {
    return "failed";
  }
}

export async function bestEffortWriteStoreOrderParticipantRoles(
  sb: SupabaseClient<any> | null | undefined,
  roomId: string,
  buyerUserId: string,
  ownerUserId: string,
): Promise<"written" | "skipped" | "failed"> {
  const id = roomId.trim();
  const buyer = buyerUserId.trim();
  const owner = ownerUserId.trim();
  if (!sb || !id || !buyer || !owner) return "skipped";
  try {
    const [a, b] = await Promise.all([
      sb
        .from("community_messenger_participants")
        .update({ store_order_role: "customer" })
        .eq("room_id", id)
        .eq("user_id", buyer),
      sb
        .from("community_messenger_participants")
        .update({ store_order_role: "owner" })
        .eq("room_id", id)
        .eq("user_id", owner),
    ]);
    if (a.error || b.error) return "failed";
    return "written";
  } catch {
    return "failed";
  }
}
