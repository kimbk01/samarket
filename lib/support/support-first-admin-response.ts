/**
 * first_admin_response_at write invariant (PHASE 3-A).
 * Stamp only on the first ADMIN + PUBLIC reply.
 */

export function shouldStampFirstAdminResponseAt(input: {
  existingFirstAdminResponseAt: string | null | undefined;
  senderType: string;
  messageType: string;
}): boolean {
  if (input.senderType !== "ADMIN") return false;
  if (input.messageType !== "PUBLIC") return false;
  const existing = input.existingFirstAdminResponseAt;
  if (typeof existing === "string" && existing.trim()) return false;
  return true;
}
