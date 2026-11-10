"use client";

import { useEffect, useMemo, useState } from "react";
import { readTradePostThumbnailCache, writeTradePostThumbnailCache } from "@/lib/community-messenger/trade-chat-list/trade-post-thumbnail-cache";
import { resolveTradeChatListThumbnailDisplayUrl } from "@/lib/community-messenger/trade-chat-list/view-model";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  src: string | null | undefined;
  postId?: string | null;
  /** 상대 미니 사진 (22×22 · 모서리 9 · 흰 테두리 2px, 오른쪽 아래) — 없으면 그리지 않는다 */
  peer?: { avatarUrl: string | null | undefined } | null;
};

/** 채팅 시안 4판 「9」 — 상품 사진 48 둥근 사각(모서리 18, 대화 목록 사진과 같은 값) */
const THUMB_SIZE = 48;
const THUMB_ROUNDED_CLASS = "rounded-[var(--cm-chat-photo-radius,18px)]";

/** 사진 없음 — 옅은 칸 + 작은 「상품」 글자 (시안 `.av.prod`) */
function TradeProductPlaceholder() {
  const { t } = useI18n();
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center ${THUMB_ROUNDED_CLASS} text-[11px] font-medium text-white`}
      style={{ background: "var(--cm-pillar-product-placeholder-bg)" }}
      data-cm-trade-thumb-placeholder=""
    >
      {t("cm_trade_chat_thumb_placeholder")}
    </div>
  );
}

export function TradeProductThumb({ src, postId, peer }: Props) {
  const pid = typeof postId === "string" ? postId.trim() : "";
  const directUrl = useMemo(() => resolveTradeChatListThumbnailDisplayUrl(src), [src]);
  const [failed, setFailed] = useState(false);
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);

  const cachedUrl = pid ? readTradePostThumbnailCache(pid) : null;
  const displayUrl = cachedUrl ?? fetchedUrl ?? (failed ? null : directUrl);

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

  /** P-4 (I9·I10): 목록 칸은 thumb 변형본·지연 로드(행마다 즉시 고우선 금지) */
  const fallbackNode = <TradeProductPlaceholder />;

  return (
    <div className="relative h-12 w-12 shrink-0" data-cm-trade-thumb="">
      {!displayUrl ? (
        fallbackNode
      ) : (
        <SamarketThumbnail
          loadingStyle="shimmer"
          retryOriginalOnError
          src={displayUrl}
          size={THUMB_SIZE}
          roundedClassName={THUMB_ROUNDED_CLASS}
          className="bg-[color:var(--cm-chat-band)] object-cover"
          fetchDisplayPx={THUMB_SIZE}
          fallbackSrc=""
          fallbackNode={fallbackNode}
          onImageError={() => setFailed(true)}
        />
      )}
      {peer ? (
        <span className="absolute -bottom-[3px] -right-[3px] z-[1]" data-cm-trade-thumb-peer="">
          <SamarketUserAvatarThumb
            avatarUrl={peer.avatarUrl}
            size={22}
            roundedClassName="rounded-[9px]"
            className="h-[22px] w-[22px] border-2 border-white bg-[color:var(--cm-chat-band)]"
          />
        </span>
      ) : null}
    </div>
  );
}
