"use client";

import { useEffect, useState } from "react";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";

/**
 * 로그인 사용자가 해당 매장 소유자면 `/my/business?storeId=…` (내 상점 관리).
 * 서버는 `/api/me/stores`로만 판별 — 공개 API에 owner 플래그를 노출하지 않음.
 */
export function useOwnerManagementHref(
  store: { id: string; slug: string } | null
): string | null {
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    if (!store) {
      setHref(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { status, json: raw } = await fetchMeStoresListDeduped();
        if (cancelled) return;
        if (status < 200 || status >= 300) {
          setHref(null);
          return;
        }
        const json = (raw && typeof raw === "object" ? raw : {}) as {
          ok?: boolean;
          stores?: { id: string; slug: string }[];
        };
        if (!json?.ok || !Array.isArray(json.stores)) {
          setHref(null);
          return;
        }
        const mine = json.stores.find((s) => s.id === store.id || s.slug === store.slug);
        setHref(mine ? `/my/business?storeId=${encodeURIComponent(mine.id)}` : null);
      } catch {
        if (!cancelled) setHref(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store?.id, store?.slug]);

  return href;
}
