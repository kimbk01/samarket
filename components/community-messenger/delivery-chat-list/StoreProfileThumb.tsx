"use client";

import { useEffect, useMemo, useState } from "react";
import {
  prefetchStoreProfileThumbnailIfNeeded,
  readStoreProfileThumbnailCache,
  writeStoreProfileThumbnailCache,
} from "@/lib/community-messenger/delivery-chat-list/store-profile-thumbnail-cache";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

type Props = {
  src: string | null | undefined;
  storeId: string | null | undefined;
  storeName: string;
};

function StoreInitialFallback({ storeName }: { storeName: string }) {
  const initial = (storeName.trim()[0] ?? "S").toUpperCase();
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] sam-text-body font-semibold"
      style={{ color: "var(--messenger-text-secondary)" }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

/** 주문 채팅 목록 — 매장 프로필(원형 로고) */
export function StoreProfileThumb({ src, storeId, storeName }: Props) {
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const directUrl = useMemo(() => {
    const u = typeof src === "string" ? src.trim() : "";
    return u.length > 0 ? u : null;
  }, [src]);
  const [failed, setFailed] = useState(false);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);

  const cachedUrl = sid ? readStoreProfileThumbnailCache(sid) : null;
  const displayUrl = cachedUrl ?? fetchedUrl ?? (failed ? null : directUrl);

  useEffect(() => {
    if (sid && directUrl) writeStoreProfileThumbnailCache(sid, directUrl);
  }, [sid, directUrl]);

  useEffect(() => {
    setFailed(false);
    setFetchedUrl(null);
  }, [sid]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!sid) return;
    if (readStoreProfileThumbnailCache(sid)) return;
    if (directUrl && !failed) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/community-messenger/store-profile-thumbnail?storeId=${encodeURIComponent(sid)}`,
          { credentials: "include" }
        );
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
        if (cancelled || !res.ok || !j.ok) return;
        const u = typeof j.url === "string" && j.url.trim() ? j.url.trim() : null;
        if (u) {
          writeStoreProfileThumbnailCache(sid, u);
          setFetchedUrl(u);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sid, directUrl, failed]);

  useEffect(() => {
    prefetchStoreProfileThumbnailIfNeeded(sid);
  }, [sid]);

  if (!displayUrl) {
    return <StoreInitialFallback storeName={storeName} />;
  }

  return (
    <SamarketThumbnail
      src={displayUrl}
      size={56}
      roundedClassName="rounded-full"
      className="border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
      fallbackSrc=""
      fallbackNode={<StoreInitialFallback storeName={storeName} />}
      onImageError={() => setFailed(true)}
    />
  );
}
