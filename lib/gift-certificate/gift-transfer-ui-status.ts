/**
 * Session-local Gift Transfer presentation status.
 * After accept/reject/cancel API success, this wins over stale message.metadata.transfer_status
 * across timeline remounts in the same UI session. Not a financial authority.
 */

import type { GiftCertificateMessageMetadata } from "@/lib/gift-certificate/gift-certificate-message-metadata";

export type GiftTransferUiStatus = NonNullable<
  GiftCertificateMessageMetadata["transfer_status"]
>;

const STORAGE_KEY = "dibay.gift_transfer_ui_status.v1";

const byTransferId = new Map<string, GiftTransferUiStatus>();
let hydrated = false;

function hydrateFromSession(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== "object") return;
    for (const [id, status] of Object.entries(parsed)) {
      if (!id || !status) continue;
      byTransferId.set(id, status as GiftTransferUiStatus);
    }
  } catch {
    /* ignore corrupt session cache */
  }
}

function persistToSession(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, string> = {};
    for (const [id, status] of byTransferId) obj[id] = status;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode */
  }
}

export function rememberGiftTransferUiStatus(
  transferId: string,
  status: GiftTransferUiStatus
): void {
  hydrateFromSession();
  const id = transferId.trim();
  if (!id) return;
  byTransferId.set(id, status);
  persistToSession();
}

export function resolveGiftTransferUiStatus(
  transferId: string,
  metadataFallback: GiftTransferUiStatus | null | undefined
): GiftTransferUiStatus {
  hydrateFromSession();
  const id = transferId.trim();
  const remembered = id ? byTransferId.get(id) : undefined;
  if (remembered) return remembered;
  return metadataFallback ?? "PENDING";
}

/** test-only */
export function __resetGiftTransferUiStatusForTests(): void {
  byTransferId.clear();
  hydrated = false;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
