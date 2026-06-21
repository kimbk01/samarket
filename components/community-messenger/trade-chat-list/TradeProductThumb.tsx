"use client";

import { useEffect, useMemo, useState } from "react";
import { TRADE_CHAT_LIST_CATEGORY_PILL_CLASS } from "@/lib/community-messenger/trade-chat-list/category-menu-chip-style";
import { readTradePostThumbnailCache, writeTradePostThumbnailCache } from "@/lib/community-messenger/trade-chat-list/trade-post-thumbnail-cache";
import { resolveTradeChatListThumbnailDisplayUrl } from "@/lib/community-messenger/trade-chat-list/view-model";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

type Props = {
  src: string | null | undefined;
  postId?: string | null;
  categoryChipLabel?: string | null;
};

const THUMB_SIZE = 56;

export function TradeProductThumb({ src, postId, categoryChipLabel }: Props) {
  const pid = typeof postId === "string" ? postId.trim() : "";
  const directUrl = useMemo(() => resolveTradeChatListThumbnailDisplayUrl(src), [src]);
  const [failed, setFailed] = useState(false);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);

  const cachedUrl = pid ? readTradePostThumbnailCache(pid) : null;
  const displayUrl = cachedUrl ?? fetchedUrl ?? (failed ? null : directUrl);
  const chipLabel = typeof categoryChipLabel === "string" ? categoryChipLabel.trim() : "";

  useEffect(() => {
    if (pid && directUrl) writeTradePostThumbnailCache(pid, directUrl);
  }, [pid, directUrl]);

  useEffect(() => {
    setFailed(false);
    setFetchedUrl(null);
  }, [pid]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!pid) return;
    if (readTradePostThumbnailCache(pid)) return;
    if (directUrl && !failed) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/community-messenger/trade-post-thumbnail?postId=${encodeURIComponent(pid)}`, {
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string | null };
        if (cancelled || !res.ok || !j.ok) return;
        const u = typeof j.url === "string" && j.url.trim() ? j.url.trim() : null;
        if (!u) return;
        writeTradePostThumbnailCache(pid, u);
        setFailed(false);
        setFetchedUrl(u);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pid, directUrl, failed]);

  const fallbackNode = <span className="text-[10px] font-medium text-[#6B7280]">거래</span>;

  return (
    <div className="relative h-[56px] w-[56px] shrink-0 overflow-hidden rounded-xl">
      {!displayUrl ? (
        <SamarketThumbnail
          src={null}
          size={THUMB_SIZE}
          roundedClassName="rounded-xl"
          className="bg-[#EAF4EF]"
          fallbackSrc=""
          fallbackNode={fallbackNode}
        />
      ) : (
        <SamarketThumbnail
          src={displayUrl}
          size={THUMB_SIZE}
          roundedClassName="rounded-xl"
          className="bg-[#EAF4EF] object-cover"
          priority={Boolean(displayUrl)}
          fallbackSrc=""
          fallbackNode={fallbackNode}
          onImageError={() => setFailed(true)}
        />
      )}
      {chipLabel ? (
        <span className={`absolute left-0.5 top-0.5 z-[1] ${TRADE_CHAT_LIST_CATEGORY_PILL_CLASS}`} title={chipLabel}>
          {chipLabel}
        </span>
      ) : null}
    </div>
  );
}
