/**
 * 10단계: 거래 mock (Supabase 연동 시 교체)
 */

import type { Transaction } from "@/lib/types/review";

const CURRENT_USER_ID = "me";

export const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-1",
    productId: "4",
    buyerId: CURRENT_USER_ID,
    sellerId: "s4",
    status: "completed",
    completedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: "tx-2",
    productId: "my-3",
    buyerId: "b2",
    sellerId: CURRENT_USER_ID,
    status: "completed",
    completedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

export function getCompletedTransactionsForUser(userId: string): Transaction[] {
  return MOCK_TRANSACTIONS.filter(
    (t) => t.status === "completed" && (t.buyerId === userId || t.sellerId === userId)
  );
}

export function getTransactionById(id: string): Transaction | undefined {
  return MOCK_TRANSACTIONS.find((t) => t.id === id);
}

