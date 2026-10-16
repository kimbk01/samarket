"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  cmRenderAnalysisEnabled,
  recordCmRenderImageDecodeSample,
} from "@/lib/community-messenger/monitoring/cm-render-analysis";
import { recordCmPolishAttachmentDecodeMs } from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import { MESSENGER_ALBUM_REST_TILE_INDEX } from "@/lib/community-messenger/attachment/messenger-photo-save-menu";

const BUBBLE_MAX =
  "mx-auto w-full min-w-[140px] max-w-[min(62vw,280px)] sm:max-w-[min(62vw,320px)] md:max-w-[min(62vw,360px)]";

function clampAspectRatio(n: number): number {
  return Math.min(1.5, Math.max(0.75, n));
}

export function MessengerChatImageBubble(props: {
  item: CommunityMessengerMessage & { pending?: boolean };
  onOpenLightbox: (urls: string[], originals: string[], index: number) => void;
}) {
  const { t } = useI18n();
  const { item, onOpenLightbox } = props;
  const pending = Boolean(item.pending);
  const album = item.imageAlbumUrls && item.imageAlbumUrls.length > 1 ? item.imageAlbumUrls : null;

  const openFrom = (idx: number) => {
    if (album) {
      const previews =
        item.imageAlbumPreviewUrls && item.imageAlbumPreviewUrls.length === album.length
          ? item.imageAlbumPreviewUrls
          : album;
      const originals =
        item.imageAlbumOriginalUrls && item.imageAlbumOriginalUrls.length === album.length
          ? item.imageAlbumOriginalUrls
          : album;
      onOpenLightbox(previews, originals, idx);
      return;
    }
    const u = (item.imagePreviewUrl ?? item.content).trim();
    const o = (item.imageOriginalUrl ?? item.content).trim();
    onOpenLightbox([u], [o], 0);
  };

  if (album) {
    return (
      <div className={`${BUBBLE_MAX} max-h-[360px] bg-transparent`}>
        <AlbumLayout urls={album} pending={pending} onOpenCell={openFrom} />
        {pending ? (
          <p
            className={`mt-1 text-center sam-text-xxs ${item.isMine ? "text-white/85" : "text-sam-muted"}`}
          >
            {t("common_sending")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <SingleChatImage
      src={item.content.trim()}
      width={item.imageWidth ?? null}
      height={item.imageHeight ?? null}
      pending={pending}
      isMine={item.isMine}
      onOpen={() => openFrom(0)}
    />
  );
}

function AlbumLayout({
  urls,
  pending,
  onOpenCell,
}: {
  urls: string[];
  pending?: boolean;
  onOpenCell: (i: number) => void;
}) {
  const { t } = useI18n();
  const n = urls.length;
  const restCount = n > 4 ? n - 4 : 0;

  const cell = (src: string, i: number, className: string) => (
    <button
      key={i}
      type="button"
      className={`relative overflow-hidden bg-black/10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)] ${className}`}
      onClick={() => onOpenCell(i)}
      data-album-index={i}
      aria-label={`${t("cm_ui_photo")} ${i + 1} ${t("cm_ui_view_photo_large")}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover ${pending ? "blur-sm opacity-70" : ""}`}
        loading="lazy"
        decoding="async"
      />
    </button>
  );

  if (n === 2) {
    return (
      <div className="grid aspect-[4/3] max-h-[360px] w-full grid-cols-2 gap-[3px] overflow-hidden rounded-[16px] bg-transparent">
        {cell(urls[0]!, 0, "")}
        {cell(urls[1]!, 1, "")}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="grid max-h-[360px] w-full grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[16px] bg-transparent">
        {cell(urls[0]!, 0, "row-span-2 h-full min-h-0")}
        {cell(urls[1]!, 1, "")}
        {cell(urls[2]!, 2, "")}
      </div>
    );
  }

  if (n === 4) {
    return (
      <div className="aspect-square max-h-[360px] w-full overflow-hidden rounded-[16px] bg-transparent">
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-[3px]">
          {urls.slice(0, 4).map((src, i) => cell(src, i, ""))}
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-square max-h-[360px] w-full overflow-hidden rounded-[16px] bg-transparent">
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-[3px]">
        {cell(urls[0]!, 0, "")}
        {cell(urls[1]!, 1, "")}
        {cell(urls[2]!, 2, "")}
        {/* 「+N」 칸: urls[3] 을 보여 주므로 탭하면 같은 사진(3)부터 뷰어를 연다. 특정 사진 길게 누르기 대상 아님. */}
        <button
          type="button"
          className="relative overflow-hidden bg-black/15 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)]"
          onClick={() => onOpenCell(MESSENGER_ALBUM_REST_TILE_INDEX)}
          data-album-rest="1"
          aria-label={`${t("cm_ui_view")} ${restCount + 1}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[MESSENGER_ALBUM_REST_TILE_INDEX]!}
            alt=""
            className={`h-full w-full object-cover ${pending ? "blur-sm opacity-70" : ""}`}
            loading="lazy"
            decoding="async"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 sam-text-section-title font-bold text-white">
            +{restCount}
          </span>
        </button>
      </div>
    </div>
  );
}

function SingleChatImage({
  src,
  width,
  height,
  pending,
  isMine,
  onOpen,
}: {
  src: string;
  /** 서버가 저장한 표시 크기 — 있으면 로드 전부터 말풍선 비율을 고정한다(로드 후 커지며 하단이 잘리지 않게). */
  width: number | null;
  height: number | null;
  pending?: boolean;
  isMine: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const imgDecodeStartRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!cmRenderAnalysisEnabled()) return;
    imgDecodeStartRef.current = typeof performance !== "undefined" ? performance.now() : null;
  }, [src]);
  /** 같은 말풍선의 src 교체(보내는 중 로컬 미리보기 → 서버 사진)는 같은 사진이므로 측정 비율을 유지한다. */
  const [loadedAr, setLoadedAr] = useState<number | null>(null);
  const knownAr = width != null && height != null && width > 0 && height > 0 ? width / height : null;
  const ar = knownAr ?? loadedAr;
  const ratio = ar != null ? clampAspectRatio(ar) : 4 / 5;

  /**
   * src 가 바뀌면 새 사진이 디코드될 때까지 직전에 그려진 사진을 아래에 깔아 둔다 —
   * 빈 칸(말풍선 배경색)이 번쩍이지 않게(텔레그램·카톡과 동일하게 끊김 없이 교체).
   */
  const lastPaintedSrcRef = useRef<string | null>(null);
  const [underlaySrc, setUnderlaySrc] = useState<string | null>(null);
  useLayoutEffect(() => {
    const painted = lastPaintedSrcRef.current;
    setUnderlaySrc(painted && painted !== src ? painted : null);
  }, [src]);

  return (
    <div className={BUBBLE_MAX}>
      <button
        type="button"
        onClick={onOpen}
        data-album-index={0}
        className="relative block w-full overflow-hidden rounded-[16px] border-0 bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)]"
        aria-label={t("cm_ui_view_photo_large")}
      >
        <div
          className="relative max-h-[360px] w-full overflow-hidden"
          style={{ aspectRatio: ratio, contain: "layout" }}
        >
          {underlaySrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={underlaySrc}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover"
              decoding="async"
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className={`relative h-full w-full object-cover ${pending ? "scale-105 blur-sm opacity-75" : ""}`}
            loading={underlaySrc ? "eager" : "lazy"}
            decoding="async"
            onLoad={(e) => {
              const el = e.currentTarget;
              const w = el.naturalWidth;
              const h = el.naturalHeight;
              if (imgDecodeStartRef.current != null && typeof performance !== "undefined") {
                const decodeMs = performance.now() - imgDecodeStartRef.current;
                recordCmRenderImageDecodeSample(decodeMs);
                recordCmPolishAttachmentDecodeMs(decodeMs);
                imgDecodeStartRef.current = null;
              }
              lastPaintedSrcRef.current = src;
              setUnderlaySrc(null);
              if (w > 0 && h > 0) {
                const nextAr = w / h;
                setLoadedAr((prev) => (prev === nextAr ? prev : nextAr));
              }
            }}
          />
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/25">
              <span
                className="h-9 w-9 animate-spin rounded-full border-2 border-white/90 border-t-transparent"
                aria-hidden
              />
            </div>
          ) : null}
        </div>
      </button>
      {pending ? (
        <p className={`mt-1 text-center sam-text-xxs ${isMine ? "text-white/85" : "text-sam-muted"}`}>{t("common_sending")}</p>
      ) : null}
    </div>
  );
}
