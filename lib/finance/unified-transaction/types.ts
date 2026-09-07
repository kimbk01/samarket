/**
 * Unified finance transaction row for LIST/DETAIL (projection over existing ledgers).
 */
import type { FinanceWallet } from "@/lib/finance/presentation";

export type FinanceUnifiedTx = {
  id: string;
  /** Composite key for routing: cash:uuid | coin:uuid | point:uuid | obligation:uuid */
  txKey: string;
  occurredAt: string;
  wallet: FinanceWallet;
  entryKind: string;
  direction: "credit" | "debit" | "info";
  amount: number;
  amountMinor: number | null;
  balanceAfter: number | null;
  balanceAfterMinor: number | null;
  storeId: string | null;
  storeName: string | null;
  ownerId: string | null;
  memberId: string | null;
  memberLabel: string | null;
  orderId: string | null;
  adId: string | null;
  status: string | null;
  relatedType: string | null;
  relatedId: string | null;
  sourceTable: string;
  meta: Record<string, unknown>;
};

export type FinanceUnifiedTxQuery = {
  wallet?: FinanceWallet | null;
  type?: string | null;
  direction?: "credit" | "debit" | null;
  storeId?: string | null;
  orderId?: string | null;
  adId?: string | null;
  memberId?: string | null;
  fromIso?: string | null;
  toIso?: string | null;
  limit?: number;
};
