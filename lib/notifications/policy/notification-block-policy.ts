import type { SupabaseClient } from "@supabase/supabase-js";
import { isBlockedEitherWayActive } from "@/lib/community-messenger/social-relations";

export async function isNotificationBlockedForRecipient(
  sb: SupabaseClient<any>,
  recipientUserId: string,
  actorUserId: string
): Promise<boolean> {
  const recipient = recipientUserId.trim();
  const actor = actorUserId.trim();
  if (!recipient || !actor || recipient === actor) return false;
  return isBlockedEitherWayActive(recipient, actor, sb);
}
