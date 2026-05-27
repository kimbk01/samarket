"use client";

import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import {
  ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
  type AddressDefaultsSnapshot,
} from "@/lib/addresses/address-defaults-snapshot";

const ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT = "me:address-defaults:snapshot";

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

/** RSC·프로필 편집 직후 — 클라 TTL 캐시에 서버 스냅샷 주입(첫 페인트 깜빡임 방지). */
export function seedAddressDefaultsSnapshotCache(snapshot: AddressDefaultsSnapshot): void {
  cachedSnapshot = {
    value: cloneSnapshot(snapshot),
    expiresAt: Date.now() + ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
  };
}

/** TTL 안 스냅샷 — 동기 읽기(탭 전환 시 주소 알약 깜빡임 방지). */
export function peekFreshAddressDefaultsSnapshot(): AddressDefaultsSnapshot | null {
  const now = Date.now();
  if (!cachedSnapshot || cachedSnapshot.expiresAt <= now) return null;
  return cloneSnapshot(cachedSnapshot.value);
}

export async function fetchAddressDefaultsSnapshot(
  opts?: { force?: boolean; timeoutMs?: number }
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
      const timeoutMs = Math.max(1_000, Number(opts?.timeoutMs ?? 8_000));
      const ac = new AbortController();
      const t = globalThis.setTimeout(() => ac.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch("/api/me/address-defaults", {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
      } finally {
        globalThis.clearTimeout(t);
      }
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
      if (value.ok && value.status === 200) {
        cachedSnapshot = {
          value,
          expiresAt: Date.now() + ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
        };
      }
      return value;
    });
    return cloneSnapshot(snapshot);
  } catch {
    return null;
  }
}

export type { AddressDefaultsSnapshot };
