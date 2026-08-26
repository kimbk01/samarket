/**
 * Messenger Gift Certificate card — presentation only.
 * Money / ownership authority = gift_certificate_* RPCs (never this metadata alone).
 */

export type GiftCertificateMessageMetadata = {
  gift_transfer_id: string;
  instance_id?: string;
  store_id?: string;
  face_value?: number;
  remaining_balance?: number;
  transfer_status?: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
};

export function parseGiftCertificateMessageMetadata(
  metadata: unknown
): GiftCertificateMessageMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const row = metadata as Record<string, unknown>;
  const giftTransferId = String(row.gift_transfer_id ?? "").trim();
  if (!giftTransferId) return null;
  const statusRaw = String(row.transfer_status ?? "PENDING").trim().toUpperCase();
  const transfer_status =
    statusRaw === "ACCEPTED" ||
    statusRaw === "REJECTED" ||
    statusRaw === "CANCELLED" ||
    statusRaw === "PENDING"
      ? statusRaw
      : "PENDING";
  return {
    gift_transfer_id: giftTransferId,
    instance_id: row.instance_id != null ? String(row.instance_id) : undefined,
    store_id: row.store_id != null ? String(row.store_id) : undefined,
    face_value: Number.isFinite(Number(row.face_value)) ? Math.trunc(Number(row.face_value)) : undefined,
    remaining_balance: Number.isFinite(Number(row.remaining_balance))
      ? Math.trunc(Number(row.remaining_balance))
      : undefined,
    transfer_status,
  };
}
