"use client";

import { useLayoutEffect } from "react";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { seedMeStoresListClientCacheFromStores } from "@/lib/me/fetch-me-stores-deduped";
import { seedOwnerLiteStoreFromStores } from "@/lib/stores/owner-lite-external-store";

/**
 * `/stores/owner` RSC가 이미 읽은 매장 목록을 클라이언트 me-stores TTL에 시드하고,
 * 동일 rows로 OwnerLite shell projection을 맞춘다.
 * `BusinessAdminShell`의 `reloadStores`가 동일 GET을 한 번 더 치지 않게 한다(허브 진입 왕복 1회 절감).
 */
export function OwnerHubMeStoresCacheSeed({ stores }: { stores: StoreRow[] }) {
  seedMeStoresListClientCacheFromStores(stores);
  seedOwnerLiteStoreFromStores(stores);
  useLayoutEffect(() => {
    seedMeStoresListClientCacheFromStores(stores);
    seedOwnerLiteStoreFromStores(stores);
  }, [stores]);
  return null;
}
