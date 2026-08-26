/**
 * SSOT ROI: cost_ratio = order_sales_php / store_funded when store_funded > 0.
 * PLATFORM 100% → null (UI: 매장 부담 없음).
 */
export function projectCouponOfferCostRatio(input: {
  orderSalesPhp: number;
  storeFundedPhp: number;
}): number | null {
  const sales = Math.round(Number(input.orderSalesPhp) || 0);
  const storeFunded = Math.round(Number(input.storeFundedPhp) || 0);
  if (storeFunded <= 0) return null;
  return sales / storeFunded;
}
