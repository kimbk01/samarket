/**
 * UI-1 — Owner application wizard step SSOT (4 focused steps, design board wins over P0-C scroll-all).
 */

export type OwnerDeliveryAdApplicationStep = 1 | 2 | 3 | 4;

export const OWNER_DELIVERY_AD_APPLICATION_STEP_COUNT = 4 as const;

export function parseOwnerDeliveryAdApplicationStep(
  raw: string | null | undefined
): OwnerDeliveryAdApplicationStep {
  const n = Number(String(raw ?? "").trim());
  if (n === 2 || n === 3 || n === 4) return n;
  return 1;
}

export function canAdvanceOwnerApplicationStep(input: {
  step: OwnerDeliveryAdApplicationStep;
  storeId: string;
  inventoryKey: string;
  packageId: string;
  hasQuote: boolean;
  noSellablePackages: boolean;
}): boolean {
  switch (input.step) {
    case 1:
      return Boolean(input.storeId && input.inventoryKey);
    case 2:
      return Boolean(input.packageId && input.hasQuote && !input.noSellablePackages);
    case 3:
      return Boolean(input.storeId && input.inventoryKey);
    case 4:
      return false;
    default:
      return false;
  }
}
