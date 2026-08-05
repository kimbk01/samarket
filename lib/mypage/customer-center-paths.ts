/**
 * App Customer Center SSOT paths — full-page push only.
 * DO NOT: bottom sheet hub · fake FAQ/Event · Admin CP in this slice.
 */

export const CUSTOMER_CENTER_HREF = "/mypage/customer-center" as const;

/** Query on child routes so Back returns to hub when entered from hub. */
export const CUSTOMER_CENTER_FROM_QUERY = "from=customer-center" as const;

export function customerCenterChildHref(path: string): string {
  const base = path.startsWith("/") ? path : `/${path}`;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${CUSTOMER_CENTER_FROM_QUERY}`;
}

export function resolveCustomerCenterBackHref(
  from: string | null | undefined,
  fallback = "/mypage",
): string {
  return from === "customer-center" ? CUSTOMER_CENTER_HREF : fallback;
}
