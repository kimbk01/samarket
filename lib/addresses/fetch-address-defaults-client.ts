"use client";

import type { LifeDefaultLocationSummary } from "@/lib/addresses/life-default-location-summary";
import {
  ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
  type AddressDefaultsSnapshot,
} from "@/lib/addresses/address-defaults-snapshot";
import type {
  AddressDefaultsFetchCaller,
  AddressDefaultsFetchReason,
} from "@/lib/addresses/address-defaults-fetch-caller";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  captureCallerStack,
  nextMypageNetRequestId,
  pushMypageNetMarker,
} from "@/lib/runtime/mypage-network-markers";

const ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT = "me:address-defaults:snapshot";
const GLOBAL_KEY = "__SAMARKET_ADDRESS_DEFAULTS_CANONICAL__" as const;

type Cached =
  | {
      expiresAt: number;
      value: AddressDefaultsSnapshot;
    }
  | null;

type AddressDefaultsCanonical = {
  cached: Cached;
  flight: Promise<AddressDefaultsSnapshot> | null;
};

type GlobalHost = typeof globalThis & {
  [GLOBAL_KEY]?: AddressDefaultsCanonical;
};

function canonical(): AddressDefaultsCanonical {
  const g = globalThis as GlobalHost;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { cached: null, flight: null };
  }
  return g[GLOBAL_KEY]!;
}

function cloneSnapshot(value: AddressDefaultsSnapshot): AddressDefaultsSnapshot {
  return {
    ok: value.ok,
    status: value.status,
    defaults: value.defaults ? { ...value.defaults } : null,
    neighborhoodFromLife: value.neighborhoodFromLife ? { ...value.neighborhoodFromLife } : null,
  };
}

export function invalidateAddressDefaultsSnapshotCache(): void {
  const c = canonical();
  c.cached = null;
  c.flight = null;
}

/** RSC·프로필 편집 직후 — 클라 TTL 캐시에 서버 스냅샷 주입(첫 페인트 깜빡임 방지). */
export function seedAddressDefaultsSnapshotCache(snapshot: AddressDefaultsSnapshot): void {
  canonical().cached = {
    value: cloneSnapshot(snapshot),
    expiresAt: Date.now() + ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
  };
}

/** TTL 안 스냅샷 — 동기 읽기(탭 전환 시 주소 알약 깜빡임 방지). */
export function peekFreshAddressDefaultsSnapshot(): AddressDefaultsSnapshot | null {
  const now = Date.now();
  const cached = canonical().cached;
  if (!cached || cached.expiresAt <= now) return null;
  return cloneSnapshot(cached.value);
}

export type FetchAddressDefaultsOpts = {
  force?: boolean;
  timeoutMs?: number;
  caller?: AddressDefaultsFetchCaller;
  reason?: AddressDefaultsFetchReason;
};

export async function fetchAddressDefaultsSnapshot(
  opts?: FetchAddressDefaultsOpts
): Promise<AddressDefaultsSnapshot | null> {
  const caller = opts?.caller ?? "unknown";
  const reason = opts?.reason ?? "unspecified";
  const force = opts?.force === true;
  const viewerId = getCurrentUser()?.id?.trim() ?? null;
  const store = canonical();
  const cacheAgeMs =
    store.cached != null ? Math.max(0, store.cached.expiresAt - Date.now()) : null;

  if (force) {
    /**
     * Clear TTL only. Never drop an in-flight GET — parallel force callers must
     * await the same network (Xiaomi cold address-defaults ×4 at identical ts).
     */
    store.cached = null;
  }

  const now = Date.now();
  if (!force && store.cached && store.cached.expiresAt > now) {
    pushMypageNetMarker({
      event: "address_defaults_cache_hit",
      viewerId,
      caller,
      reason,
      force,
      hasFreshMemorySnapshot: true,
      cacheAgeMs: Math.max(0, store.cached.expiresAt - now),
      hasInflight: Boolean(store.flight),
      inflightKey: ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT,
    });
    return cloneSnapshot(store.cached.value);
  }

  if (store.flight) {
    pushMypageNetMarker({
      event: "address_defaults_deduped",
      viewerId,
      caller,
      reason,
      force,
      hasInflight: true,
      inflightKey: ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT,
      hasFreshMemorySnapshot: false,
      cacheAgeMs,
      stack: captureCallerStack(),
      detail: force ? "force_await_inflight" : "await_inflight",
    });
    try {
      const snapshot = await store.flight;
      return cloneSnapshot(snapshot);
    } catch {
      pushMypageNetMarker({
        event: "address_defaults_result_dropped",
        viewerId,
        caller,
        reason,
        force,
        detail: "inflight_rejected",
      });
      return null;
    }
  }

  try {
    const flight = (async () => {
      const requestId = nextMypageNetRequestId("addr");
      pushMypageNetMarker({
        event: "address_defaults_network_start",
        requestId,
        viewerId,
        caller,
        reason,
        force,
        hasInflight: false,
        inflightKey: ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT,
        hasFreshMemorySnapshot: false,
        cacheAgeMs,
        stack: captureCallerStack(),
      });
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
      } catch (err) {
        const aborted = ac.signal.aborted;
        pushMypageNetMarker({
          event: aborted ? "address_defaults_network_abort" : "address_defaults_network_error",
          requestId,
          viewerId,
          caller,
          reason,
          force,
          detail: aborted ? "timeout_or_abort" : "fetch_throw",
        });
        throw err;
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
        store.cached = {
          value,
          expiresAt: Date.now() + ADDRESS_DEFAULTS_SNAPSHOT_TTL_MS,
        };
      }
      pushMypageNetMarker({
        event: "address_defaults_network_success",
        requestId,
        viewerId,
        caller,
        reason,
        force,
        detail: `status=${value.status};ok=${value.ok};master=${value.defaults?.master != null}`,
      });
      return value;
    })();

    store.flight = flight;
    try {
      const snapshot = await flight;
      return cloneSnapshot(snapshot);
    } finally {
      if (store.flight === flight) store.flight = null;
    }
  } catch {
    return null;
  }
}

export type { AddressDefaultsSnapshot };
