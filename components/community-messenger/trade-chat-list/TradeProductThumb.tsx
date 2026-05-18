"use client";

import { useEffect, useMemo, useState } from "react";
import { readTradePostThumbnailCache, writeTradePostThumbnailCache } from "@/lib/community-messenger/trade-chat-list/trade-post-thumbnail-cache";
import { resolveTradeChatListThumbnailDisplayUrl } from "@/lib/community-messenger/trade-chat-list/view-model";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

type Props = {
  src: string | null | undefined;
  /** 목록 메타에 썸네일이 비었을 때 서버에서 posts 행으로 공개 URL 확정 */
  postId?: string | null;
};

/** 거래 글 이미지 없을 때만 「거래」 플레이스홀더 — `postId` 가 있으면 API 폴백 후 재시도 */
export function TradeProductThumb({ src, postId }: Props) {
  const pid = typeof postId === "string" ? postId.trim() : "";
  const directUrl = useMemo(() => resolveTradeChatListThumbnailDisplayUrl(src), [src]);
  const [failed, setFailed] = useState(false);
  /** fetch 로 채운 URL — 렌더마다 메모리 캐시와 함께 쓴다 */
  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);

  const cachedUrl = pid ? readTradePostThumbnailCache(pid) : null;
  /** 깨진 src는 무시하고 캐시·fetch 결과만 사용 */
  const displayUrl = cachedUrl ?? fetchedUrl ?? (failed ? null : directUrl);

  /** 부트스트랩 메타의 유효 경로가 있으면 즉시 캐시에 넣어 뒤로가기 시 동일 paint 에 재사용 */
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

  /**
   * 서버 확정 URL — 캐시 미스이고 직접 경로도 없거나 깨진 경우에만 RTT.
   * 캐시 히트 시 이 이펙트는 조기 종료.
   */
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

  if (!displayUrl) {
    return (
      <SamarketThumbnail
        src={null}
        size={56}
        roundedClassName="rounded-[10px]"
        className="border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
        fallbackSrc=""
        fallbackNode={<span className="sam-text-xxs font-medium" style={{ color: "var(--messenger-text-secondary)" }}>
          거래
        </span>}
      />
    );
  }
  return (
    <SamarketThumbnail
      src={displayUrl}
      size={56}
      roundedClassName="rounded-[10px]"
      className="border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
      priority={Boolean(cachedUrl)}
      fallbackSrc=""
      fallbackNode={<span className="sam-text-xxs font-medium" style={{ color: "var(--messenger-text-secondary)" }}>
        거래
      </span>}
      onImageError={() => setFailed(true)}
    />
  );
}
