import type { StorePointLedgerEntryType } from "@/lib/types/store-point";

export type StorePointLedgerRow = {
  id: string;
  storeId: string;
  storeName: string;
  entryType: StorePointLedgerEntryType | string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
};

export type StorePointLedgerDayGroup = {
  dateKey: string;
  totalAmount: number;
  entries: StorePointLedgerRow[];
};

/** Group ledger rows by calendar day (local timezone). */
export function groupStorePointLedgerByDate(
  entries: StorePointLedgerRow[],
  timeZone = "Asia/Seoul"
): StorePointLedgerDayGroup[] {
  const byDay = new Map<string, StorePointLedgerRow[]>();

  for (const e of entries) {
    const d = new Date(e.createdAt);
    const dateKey = Number.isNaN(d.getTime())
      ? "unknown"
      : d.toLocaleDateString("en-CA", { timeZone });
    const list = byDay.get(dateKey) ?? [];
    list.push(e);
    byDay.set(dateKey, list);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      totalAmount: dayEntries.reduce((sum, row) => sum + row.amount, 0),
      entries: dayEntries.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }));
}
