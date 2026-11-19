"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchStoreProfileThumbnailOnce,
  readStoreProfileThumbnailCache,
} from "@/lib/community-messenger/delivery-chat-list/store-profile-thumbnail-cache";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

type Props = {
  src: string | null | undefined;
  storeId: string | null | undefined;
  storeName: string;
  /** 목록 = 48 · 모서리 18 (기본) / 길게 누르기 메뉴 머리 = 44 · 모서리 16 (채팅 시안 4판 「10」「10-2」) */
  variant?: "list" | "sheet";
};

const THUMB_GEOMETRY = {
  list: { size: 48, boxClass: "h-12 w-12", roundedClass: "rounded-[var(--cm-chat-photo-radius,18px)]", textClass: "text-[17px]" },
  sheet: { size: 44, boxClass: "h-11 w-11", roundedClass: "rounded-[16px]", textClass: "text-[16px]" },
} as const;

function resolveStoreProfileDisplayUrl(raw: string | null | undefined): string | null {
  const u = typeof raw === "string" ? raw.trim() : "";
  if (!u) return null;
  return resolveStoreProductMediaUrl(u) ?? u;
}

/** 매장 사진 없음 — 옅은 금색 칸 + 갈색 첫 글자 (시안 `.av.store`) */
function StoreInitialFallback({ storeName, variant }: { storeName: string; variant: "list" | "sheet" }) {
  const initial = (storeName.trim()[0] ?? "S").toUpperCase();
  const g = THUMB_GEOMETRY[variant];
  return (
    <div
      className={`flex shrink-0 items-center justify-center font-bold ${g.boxClass} ${g.roundedClass} ${g.textClass}`}
      style={{
        background: "var(--cm-pillar-store-placeholder-bg)",
        color: "var(--cm-pillar-store-placeholder-fg)",
      }}
      aria-hidden
      data-cm-store-thumb-placeholder=""
    >
      {initial}
    </div>
  );
}


/** 주문 채팅 목록 — 매장 프로필 (둥근 사각, 채팅 시안 4판) */
export function StoreProfileThumb({ src, storeId, storeName, variant = "list" }: Props) {
  const g = THUMB_GEOMETRY[variant];
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

  const loadFromApi = useCallback(async (storeKey: string, force: boolean, cancelled: () => boolean) => {
    const raw = await fetchStoreProfileThumbnailOnce(storeKey, { force });
    if (cancelled() || !raw) return;
    setApiUrl(resolveStoreProfileDisplayUrl(raw));
    setDirectFailed(false);
  }, []);

  /**
   * 2026-11-19 — 이전엔 마운트마다 항상 API 를 불렀다(캐시가 있어도) + 행 미리 받기와 겹쳐 1행 2회.
   * 지금: 매장마다 탭 세션 1회(최신 매장 사진이 목록 주소보다 우선하는 기존 동작 유지) — 기억(사진·「사진 없음」 10분)이 있으면
   * 요청 없이 기억 사용, 같은 순간 요청은 1개로 합침. 사진 로드 실패(apiFetchKey 증가)는 기억과 관계없이 다시 조회.
   */
  useEffect(() => {
    if (!sid) return;
    let cancelled = false;
    void loadFromApi(sid, apiFetchKey > 0, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [sid, apiFetchKey, loadFromApi]);

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
    return <StoreInitialFallback storeName={storeName} variant={variant} />;
  }

  return (
    <SamarketThumbnail
      src={displayUrl}
      size={g.size}
      roundedClassName={g.roundedClass}
      className={`${g.boxClass} bg-[color:var(--cm-pillar-store-placeholder-bg)]`}
      fallbackSrc=""
      fallbackNode={<StoreInitialFallback storeName={storeName} variant={variant} />}
      priority={Boolean(displayUrl)}
      onImageError={onImageError}
    />
  );
}
