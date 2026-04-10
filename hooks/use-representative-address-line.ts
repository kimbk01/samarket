"use client";

import { useEffect, useState } from "react";
import {
  buildTradePublicLine,
  stripCountryFromAddressDisplayLine,
} from "@/lib/addresses/user-address-format";
import { rowToUserAddressDTO } from "@/lib/addresses/user-address-mapper";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

export type RepresentativeAddressLineState =
  | { status: "loading" }
  | { status: "ready"; line: string | null };

function coerceMaster(raw: unknown): UserAddressDTO | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if ("appRegionId" in o || "fullAddress" in o) {
    return o as UserAddressDTO;
  }
  return rowToUserAddressDTO(o);
}

/**
 * 대표(master) 주소 한 줄 — `buildTradePublicLine`(전체 주소 우선)과 동일.
 * 첫 응답 전에는 `loading`만 두어 프로필 폴백(예: Manila만) 깜빡임을 막는다.
 */
export function useRepresentativeAddressLine(): RepresentativeAddressLineState {
  const [state, setState] = useState<RepresentativeAddressLineState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/me/address-defaults", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          defaults?: { master?: unknown };
        };
        if (cancelled) return;
        if (!res.ok || !j.ok) {
          setState({ status: "ready", line: null });
          return;
        }
        const raw = j.defaults?.master;
        const m = coerceMaster(raw);
        if (!m?.id) {
          setState({ status: "ready", line: null });
          return;
        }
        const s = stripCountryFromAddressDisplayLine(buildTradePublicLine(m), m.countryName).trim();
        setState({ status: "ready", line: s || null });
      } catch {
        if (!cancelled) setState({ status: "ready", line: null });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
