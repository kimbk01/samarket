"use client";

import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";

const ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT = "me:address-defaults:snapshot";
const ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS = 20_000;

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

let cachedSnapshot:
  | {
      expiresAt: number;
      value: AddressDefaultsSnapshot;
    }
  | null = null;

function cloneSnapshot(value: AddressDefaultsSnapshot): AddressDefaultsSnapshot {
  return {
    ok: value.ok,
    status: value.status,
    defaults: value.defaults ? { ...value.defaults } : null,
    neighborhoodFromLife: value.neighborhoodFromLife ? { ...value.neighborhoodFromLife } : null,
  };
}

export function invalidateAddressDefaultsSnapshotCache(): void {
  cachedSnapshot = null;
  forgetSingleFlight(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT);
}

export async function fetchAddressDefaultsSnapshot(
  opts?: { force?: boolean }
): Promise<AddressDefaultsSnapshot | null> {
  if (opts?.force) {
    invalidateAddressDefaultsSnapshotCache();
  }
  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
    return cloneSnapshot(cachedSnapshot.value);
  }
  try {
    const snapshot = await runSingleFlight(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT, async () => {
      const res = await fetch("/api/me/address-defaults", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        defaults?: {
          master?: unknown;
          life?: unknown;
          trade?: unknown;
          delivery?: unknown;
        };
        neighborhoodFromLife?: LifeDefaultLocationSummary;
      };
      const neighborhoodFromLife =
        json?.neighborhoodFromLife &&
        typeof json.neighborhoodFromLife === "object" &&
        typeof json.neighborhoodFromLife.complete === "boolean" &&
        typeof json.neighborhoodFromLife.label === "string"
          ? json.neighborhoodFromLife
          : null;
      const value: AddressDefaultsSnapshot = {
        ok: Boolean(res.ok && json?.ok),
        status: res.status,
        defaults:
          json?.defaults && typeof json.defaults === "object" ? { ...json.defaults } : null,
        neighborhoodFromLife,
      };
      cachedSnapshot = {
        value,
        expiresAt: Date.now() + ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
      };
      return value;
    });
    return cloneSnapshot(snapshot);
  } catch {
    return null;
  }
}
