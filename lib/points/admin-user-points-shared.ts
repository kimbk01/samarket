import type { PointChargeRequest, PointLedgerEntry } from "@/lib/types/point";

export function isMissingPointsTable(message: string, table: string): boolean {
  const lowered = message.toLowerCase();
  const tableLower = table.toLowerCase();
  if (!lowered.includes(tableLower)) return false;
  return (
    lowered.includes("does not exist") ||
    lowered.includes("schema cache") ||
    lowered.includes("could not find")
  );
}

export function normalizeLedgerRow(
  row: Record<string, unknown>,
  userId: string,
  userNickname: string
): PointLedgerEntry {
  return {
    id: String(row.id ?? ""),
    userId,
    userNickname,
    entryType: String(row.entry_type ?? "admin_adjust") as PointLedgerEntry["entryType"],
    amount: Number(row.amount ?? 0),
    balanceAfter: Number(row.balance_after ?? 0),
    relatedType: String(row.related_type ?? "admin_manual") as PointLedgerEntry["relatedType"],
    relatedId: String(row.related_id ?? ""),
    description: String(row.description ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    actorType: String(row.actor_type ?? "system") as PointLedgerEntry["actorType"],
    earnedAt: row.earned_at ? String(row.earned_at) : undefined,
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    expiredAmount: row.expired_amount == null ? undefined : Number(row.expired_amount),
    isExpired: row.expires_at ? new Date(String(row.expires_at)).getTime() < Date.now() : undefined,
  };
}

export function normalizeChargeRequest(
  row: Record<string, unknown>,
  userId: string,
  userNickname: string
): PointChargeRequest {
  return {
    id: String(row.id ?? ""),
    userId,
    userNickname,
    planId: String(row.plan_id ?? ""),
    planName: String(row.plan_name ?? ""),
    paymentMethod: String(row.payment_method ?? "manual_confirm") as PointChargeRequest["paymentMethod"],
    paymentAmount: Number(row.payment_amount ?? 0),
    pointAmount: Number(row.point_amount ?? 0),
    requestStatus: String(row.request_status ?? "pending") as PointChargeRequest["requestStatus"],
    depositorName: String(row.depositor_name ?? ""),
    receiptImageUrl: String(row.receipt_image_url ?? ""),
    requestedAt: String(row.requested_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    adminMemo: row.admin_memo ? String(row.admin_memo) : undefined,
    userMemo: row.user_memo ? String(row.user_memo) : undefined,
    approvedAt: row.approved_at ? String(row.approved_at) : undefined,
    approvedBy: row.approved_by ? String(row.approved_by) : undefined,
    processedAt: row.processed_at ? String(row.processed_at) : undefined,
    processedBy: row.processed_by ? String(row.processed_by) : undefined,
  };
}
