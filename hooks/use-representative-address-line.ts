"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
 * 대표(master) 주소 한 줄 — `buildTradePublicLine` 기준.
 * 경로 변경·뒤로 가기(popstate) 시 다시 불러와 주소 관리 반영.
 */
export function useRepresentativeAddressLine(): RepresentativeAddressLineState {
  const pathname = usePathname();
  const [state, setState] = useState<RepresentativeAddressLineState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/me/address-defaults", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        defaults?: { master?: unknown };
      };
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
      setState({ status: "ready", line: null });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const onPop = () => void load();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  return state;
}
