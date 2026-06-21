"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  prefetchStoreProfileThumbnailIfNeeded,
  readStoreProfileThumbnailCache,
  writeStoreProfileThumbnailCache,
} from "@/lib/community-messenger/delivery-chat-list/store-profile-thumbnail-cache";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

type Props = {
  src: string | null | undefined;
  storeId: string | null | undefined;
  storeName: string;
};

function resolveStoreProfileDisplayUrl(raw: string | null | undefined): string | null {
  const u = typeof raw === "string" ? raw.trim() : "";
  if (!u) return null;
  return resolveStoreProductMediaUrl(u) ?? u;
}

function StoreInitialFallback({ storeName }: { storeName: string }) {
  const initial = (storeName.trim()[0] ?? "S").toUpperCase();
  return (
    <div
      className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full border border-[#D7E5DE] bg-[#EAF4EF] sam-text-body font-semibold text-[#006241]"
      aria-hidden
    >
      {initial}
    </div>
  );
}

async function fetchStoreProfileThumbnailUrl(storeId: string): Promise<string | null> {
  const res = await fetch(
    `/api/community-messenger/store-profile-thumbnail?storeId=${encodeURIComponent(storeId)}`,
    { credentials: "include" }
  );
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
  if (!res.ok || !j.ok) return null;
  const u = typeof j.url === "string" && j.url.trim() ? j.url.trim() : null;
  return u ? resolveStoreProfileDisplayUrl(u) : null;
}

/** 주문 채팅 목록 — 매장 프로필(56px 원형) */
export function StoreProfileThumb({ src, storeId, storeName }: Props) {
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const directUrl = useMemo(() => resolveStoreProfileDisplayUrl(src), [src]);
  const [apiUrl, setApiUrl] = useState<string | null>(() => {
    if (!sid) return null;
    const cached = readStoreProfileThumbnailCache(sid);
    return cached ? resolveStoreProfileDisplayUrl(cached) : null;
  });
  const [directFailed, setDirectFailed] = useState(false);
  const [apiFetchKey, setApiFetchKey] = useState(0);

  useEffect(() => {
    setDirectFailed(false);
  }, [src, sid]);

  const loadFromApi = useCallback(async (storeKey: string, cancelled: () => boolean) => {
    try {
      const resolved = await fetchStoreProfileThumbnailUrl(storeKey);
      if (cancelled() || !resolved) return;
      writeStoreProfileThumbnailCache(storeKey, resolved);
      setApiUrl(resolved);
      setDirectFailed(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    void loadFromApi(sid, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [sid, apiFetchKey, loadFromApi]);

  useEffect(() => {
    prefetchStoreProfileThumbnailIfNeeded(sid);
  }, [sid]);

  const displayUrl = apiUrl ?? (directFailed ? null : directUrl);

  const onImageError = useCallback(() => {
    if (apiUrl) {
      setApiUrl(null);
    } else {
      setDirectFailed(true);
    }
    if (sid) setApiFetchKey((k) => k + 1);
  }, [apiUrl, sid]);

  if (!displayUrl) {
    return <StoreInitialFallback storeName={storeName} />;
  }

  return (
    <SamarketThumbnail
      src={displayUrl}
      size={56}
      roundedClassName="rounded-full"
      className="border border-[#D7E5DE] bg-[#EAF4EF]"
      fallbackSrc=""
      fallbackNode={<StoreInitialFallback storeName={storeName} />}
      priority={Boolean(displayUrl)}
      onImageError={onImageError}
    />
  );
}
