import { OWNER_SAMPLE_STORE_ID, OWNER_SAMPLE_STORE_SLUG } from "./mockOrders";

export function resolveOwnerSampleStoreId(slug: string): string | null {
  return slug === OWNER_SAMPLE_STORE_SLUG ? OWNER_SAMPLE_STORE_ID : null;
}
