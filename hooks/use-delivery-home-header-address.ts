"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  resolveDeliveryHomeHeaderDisplayLine,
  pickDeliveryHomeHeaderAddress,
  type DeliveryHomeHeaderAddressState,
} from "@/lib/addresses/delivery-home-header-address";
import {
  fetchAddressDefaultsSnapshot,
  peekFreshAddressDefaultsSnapshot,
  type AddressDefaultsSnapshot,
} from "@/lib/addresses/fetch-address-defaults-client";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";

function coerceAddress(raw: unknown): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("appRegionId" in o || "fullAddress" in o) {
    return o as UserAddressDTO;
  }
  return rowToUserAddressDTO(o);
}

function stateFromSnapshot(snapshot: AddressDefaultsSnapshot | null): DeliveryHomeHeaderAddressState {
  if (!snapshot?.ok || !snapshot.defaults) {
    return { status: "ready", line: null, hasLinkedAddress: false };
  }

  const delivery = coerceAddress(snapshot.defaults.delivery);
  const master = coerceAddress(snapshot.defaults.master);

  const picked =
    pickDeliveryHomeHeaderAddress({
      delivery,
      master,
      life: coerceAddress(snapshot.defaults.life),
      trade: coerceAddress(snapshot.defaults.trade),
    }) ?? null;

  if (!picked?.id) {
    return { status: "ready", line: null, hasLinkedAddress: false };
  }

  return {
    status: "ready",
    line: resolveDeliveryHomeHeaderDisplayLine(picked),
    hasLinkedAddress: true,
  };
}

export type DeliveryHomeHeaderAddressView = DeliveryHomeHeaderAddressState & {
  /** 마지막으로 확인된 주소 — silent refetch 중에도 깜빡임 방지 */
  displayLine: string | null;
};

/**
 * `/stores` 홈 헤더 — 배달/대표 주소 세부 한 줄 (배민형).
 * CONTRACT: 라벨 문구는 `resolveDeliveryHomeHeaderButtonLabel` — 이 훅은 줄 데이터만.
 */
export function useDeliveryHomeHeaderAddress(): DeliveryHomeHeaderAddressView {
  const pathname = usePathname();
  const lastLineRef = useRef<string | null>(null);
  const hasResolvedOnceRef = useRef(false);

  const [state, setState] = useState<DeliveryHomeHeaderAddressState>(() => {
    const snap = peekFreshAddressDefaultsSnapshot();
    if (snap) {
      const next = stateFromSnapshot(snap);
      if (next.status === "ready" && next.line?.trim()) {
        lastLineRef.current = next.line.trim();
      }
      if (next.status === "ready") hasResolvedOnceRef.current = true;
      return next;
    }
    return { status: "loading", line: null, hasLinkedAddress: false };
  });

  const commitState = useCallback((next: DeliveryHomeHeaderAddressState) => {
    if (next.status === "ready") {
      hasResolvedOnceRef.current = true;
      if (next.line?.trim()) {
        lastLineRef.current = next.line.trim();
      }
    }
    setState(next);
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent && !lastLineRef.current && !hasResolvedOnceRef.current) {
        commitState({ status: "loading" });
      }

      try {
        const snapshot = await fetchAddressDefaultsSnapshot({ force: opts?.force === true });
        if (snapshot == null) {
          if (!silent || !hasResolvedOnceRef.current) {
            commitState({ status: "ready", line: null, hasLinkedAddress: false });
          }
          return;
        }
        commitState(stateFromSnapshot(snapshot));
      } catch {
        if (!silent || !hasResolvedOnceRef.current) {
          commitState({ status: "ready", line: null, hasLinkedAddress: false });
        }
      }
    },
    [commitState]
  );

  useEffect(() => {
    void load({ silent: true });
  }, [pathname, load]);

  useEffect(() => {
    const onPop = () => void load({ silent: true });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  useEffect(() => {
    const onAddressesUpdated = () => void load({ silent: true, force: true });
    window.addEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
    return () => window.removeEventListener(SAMARKET_ADDRESSES_UPDATED_EVENT, onAddressesUpdated);
  }, [load]);

  const displayLine =
    state.status === "ready" && state.line?.trim() ? state.line.trim() : lastLineRef.current;

  return { ...state, displayLine };
}
