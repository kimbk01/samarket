import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";

export type AddressDefaultsSnapshot = {
  ok: boolean;
  status: number;
  defaults: {
    master?: unknown;
    life?: unknown;
    trade?: unknown;
    delivery?: unknown;
  } | null;
  neighborhoodFromLife: LifeDefaultLocationSummary | null;
};

export const ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS = 20_000;
