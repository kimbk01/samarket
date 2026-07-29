"use client";

import { forgetSingleFlight, getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
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
  const inflightBefore = getSingleFlightPromise<AddressDefaultsSnapshot>(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT);
  const cacheAgeMs =
    cachedSnapshot != null ? Math.max(0, cachedSnapshot.expiresAt - Date.now()) : null;

  if (force) {
    /**
     * Clear TTL only — do not forget an in-flight GET (that created parallel
     * `/api/me/address-defaults` when several force callers raced).
     * Join the current flight, then start one refresh flight.
     */
    cachedSnapshot = null;
    const inflight = inflightBefore;
    if (inflight) {
      pushMypageNetMarker({
        event: "address_defaults_deduped",
        viewerId,
        caller,
        reason,
        force: true,
        hasInflight: true,
        inflightKey: ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT,
        detail: "force_await_inflight",
      });
      try {
        await inflight;
      } catch {
        /* ignore */
      }
      cachedSnapshot = null;
    }
    forgetSingleFlight(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT);
  }

  const now = Date.now();
  if (cachedSnapshot && cachedSnapshot.expiresAt > now) {
    pushMypageNetMarker({
      event: "address_defaults_cache_hit",
      viewerId,
      caller,
      reason,
      force,
      hasFreshMemorySnapshot: true,
      cacheAgeMs: Math.max(0, cachedSnapshot.expiresAt - now),
      hasInflight: Boolean(getSingleFlightPromise(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT)),
      inflightKey: ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT,
    });
    return cloneSnapshot(cachedSnapshot.value);
  }

  const existing = getSingleFlightPromise<AddressDefaultsSnapshot>(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT);
  if (existing) {
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
    });
    try {
      const snapshot = await existing;
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
    const snapshot = await runSingleFlight(ADDRESS_DEFAULTS_SNAPSHOT_FLIGHT, async () => {
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
        cachedSnapshot = {
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
    });
    return cloneSnapshot(snapshot);
  } catch {
    return null;
  }
}

export type { AddressDefaultsSnapshot };
