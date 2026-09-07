/**
 * STEP 2 — OrderMoneyChain shared read model.
 * Items = sales composition display only. Fee/Coin = order-level canonical. No fake item allocation.
 */
export type OrderMoneyChainItem = {
  id: string;
  productId: string | null;
  title: string;
  qty: number;
  subtotal: number;
};

export type OrderMoneyChainEvent = {
  id: string;
  at: string;
  kind:
    | "ORDER_COMPLETED"
    | "SALE_FEE"
    | "SALE_FEE_OBLIGATION"
    | "SALE_FEE_SETTLEMENT"
    | "SALE_EARN"
    | "CONVERT"
    | "REFUND"
    | "REVERSAL"
    | "OTHER";
  wallet: "SETTLEMENT" | "CASH" | "COIN" | "INFO";
  label: string;
  amount: number | null;
  amountMinor: number | null;
  sourceTable: string;
  sourceId: string;
  relatedOrderId: string;
  href: string | null;
};

export type OrderMoneyChain = {
  orderId: string;
  orderNo: string;
  storeId: string;
  storeName: string;
  ownerId: string | null;
  date: string | null;
  orderStatus: string | null;
  items: OrderMoneyChainItem[];
  financial: {
    currency: "PHP";
    gross: number;
    settlementNet: number | null;
    feeRateSnapshot: number | null;
    feeDue: number;
    feeDueMinor: number;
    cashFeePaid: number;
    cashFeePaidMinor: number;
    outstandingFee: number;
    outstandingFeeMinor: number;
    coinEarned: number;
    refundAmount: number;
    settlementStatus: string | null;
    settlementId: string | null;
    obligationId: string | null;
  };
  timeline: OrderMoneyChainEvent[];
  adminOrderHref: string;
  ownerOrderHref: string | null;
};
