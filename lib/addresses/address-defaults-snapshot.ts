import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";

export type AddressDefaultsSnapshot = {
  ok: boolean;
  status: number;
  defaults: {
    master?: unknown;
    life?: unknown;
    trade?: unknown;
    delivery?: unknown;
    /** 활성 주소 수 (`GET /api/me/address-defaults` 같은 응답) — 구버전 응답이면 없음 */
    activeCount?: number | null;
  } | null;
  neighborhoodFromLife: LifeDefaultLocationSummary | null;
};

export const ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS = 20_000;
