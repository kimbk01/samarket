"use client";

import { useEffect, useState } from "react";
import { fetchMeHasOwnerStores } from "@/lib/my/fetch-me-has-owner-stores";

/** `null`: 로딩 중 — 매장 관리자 링크는 `true`일 때만 노출 */
export function useHasOwnerStores(): boolean | null {
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await fetchMeHasOwnerStores();
      if (!cancelled) setV(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return v;
}
