"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  cmRenderAnalysisEnabled,
  recordCmRenderImageDecodeSample,
} from "@/lib/community-messenger/monitoring/cm-render-analysis";
import { recordCmPolishAttachmentDecodeMs } from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import { MESSENGER_ALBUM_REST_TILE_INDEX } from "@/lib/community-messenger/attachment/messenger-photo-save-menu";
import { withMessengerMediaRouteUrls } from "@/lib/community-messenger/media/messenger-media-ref";
import type { DibayImageViewerItem } from "@/lib/ui/dibay-image-viewer-items";
import {
  messengerPhotoBubbleMaxWidthPx,
  messengerPhotoBubbleSize,
} from "@/lib/community-messenger/media/messenger-photo-bubble-size";

/**
 * 사진 말풍선 너비는 사진을 불러오기 전부터 고정한다.
 * 감싸는 말풍선이 내용 크기만큼 줄어드는 구조라, `w-full` 이면 불러오기 전 너비가 최소값(140px)이었다가
 * 사진이 오면 원본 크기만큼(최대폭) 커지며 말풍선이 바뀌었다(2026-11-08 운영 실측 140→232px).
 * 높이는 저장된 비율(`image_width`/`image_height`)로 함께 확보된다. 좁은 화면은 `max-w-full` 로 행 안에 맞춘다.
 */
const BUBBLE_MAX =
  "mx-auto w-[min(62vw,280px)] max-w-full sm:w-[min(62vw,320px)] md:w-[min(62vw,360px)]";

function subscribeViewportWidth(cb: () => void): () => void {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
function readViewportWidth(): number {
  return window.innerWidth;
}
/** 말풍선 최대 폭 기준(지금 CSS `62vw` 와 같은 화면 폭) — 회전·창 크기 변경 시 다시 계산 */
function useViewportWidth(): number {
  return useSyncExternalStore(subscribeViewportWidth, readViewportWidth, () => 384);
}

/** 앨범·사진 칸 안 사진은 칸을 채운다 — `!h-full`: 층 밖 전역 `img{height:auto}` 가 `h-full` 을 이기기 때문(D2-가 운영 미적용 원인). */
const FILL_IMG = "absolute inset-0 !h-full !w-full object-cover object-center";

export function MessengerChatImageBubble(props: {
  item: CommunityMessengerMessage & { pending?: boolean };
  /** 공용 사진 뷰어(`DibayImageViewer`) 열기 — 화면용 1600·원본·말풍선 썸네일(먼저 그림) */
  onOpenLightbox: (items: DibayImageViewerItem[], index: number) => void;
}) {
  const { t } = useI18n();
  const { onOpenLightbox } = props;
  /** C-4: 저장 URL(공개·비공개 버킷) → 참가자 확인 첨부 조회 라우트. 썸네일·라이트박스·원본 모두 같은 투영. */
  const item = withMessengerMediaRouteUrls(props.item);
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
      onOpenLightbox(
        album.map((thumb, i) => ({ display: previews[i]!, original: originals[i]!, placeholder: thumb })),
        idx
      );
      return;
    }
    const thumb = item.content.trim();
    const u = (item.imagePreviewUrl ?? item.content).trim();
    const o = (item.imageOriginalUrl ?? item.content).trim();
    onOpenLightbox([{ display: u, original: o, placeholder: thumb }], 0);
  };

  if (album) {
    return (
      <div className={`${BUBBLE_MAX} max-h-[360px] bg-transparent`}>
        <AlbumLayout urls={album} onOpenCell={openFrom} />
        {pending ? (
          <p className="mt-1 text-center sam-text-xxs text-sam-muted">
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
      onOpen={() => openFrom(0)}
    />
  );
}

function AlbumLayout({
  urls,
  onOpenCell,
}: {
  urls: string[];
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
        className={FILL_IMG}
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
    /* D3-바: 3장 배치도 4장처럼 정사각 칸을 미리 잡는다 — 비율이 없어 불러오기 전 높이 3px → 불러온 뒤 360px 로 바뀌었다(2026-11-08 운영 실측). */
    return (
      <div className="grid aspect-square max-h-[360px] w-full grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-[16px] bg-transparent">
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
            className={FILL_IMG}
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
  onOpen,
}: {
  src: string;
  /** 서버가 저장한 표시 크기 — 있으면 로드 전부터 말풍선 비율을 고정한다(로드 후 커지며 하단이 잘리지 않게). */
  width: number | null;
  height: number | null;
  pending?: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  const imgDecodeStartRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!cmRenderAnalysisEnabled()) return;
    imgDecodeStartRef.current = typeof performance !== "undefined" ? performance.now() : null;
  }, [src]);
  /**
   * 칸 크기 = `messengerPhotoBubbleSize`(텔레그램 높이 규칙). 서버 크기가 있으면 그것, 보내는 중(로컬 사진)은
   * 로컬 사진에서 잰 비율 — 같은 말풍선이 서버 사진으로 바뀌어도 같은 비율이라 칸이 그대로다.
   * 크기 정보 없는 지난 사진은 4:5 고정이고 불러온 뒤에도 칸을 바꾸지 않는다(밀림 0).
   */
  const [pendingLoadedAr, setPendingLoadedAr] = useState<number | null>(null);
  const known = width != null && height != null && width > 0 && height > 0;
  const viewportWidth = useViewportWidth();
  const size = messengerPhotoBubbleSize({
    photoWidth: known ? width : pendingLoadedAr,
    photoHeight: known ? height : pendingLoadedAr != null ? 1 : null,
    maxWidth: messengerPhotoBubbleMaxWidthPx(viewportWidth),
  });

  /**
   * src 가 바뀌면 새 사진이 디코드될 때까지 직전에 그려진 사진을 아래에 깔아 둔다 —
   * 빈 칸(말풍선 배경색)이 번쩍이지 않게 끊김 없이 교체.
   */
  const lastPaintedSrcRef = useRef<string | null>(null);
  const [underlaySrc, setUnderlaySrc] = useState<string | null>(null);
  useLayoutEffect(() => {
    const painted = lastPaintedSrcRef.current;
    setUnderlaySrc(painted && painted !== src ? painted : null);
  }, [src]);

  return (
    <div className="mx-auto max-w-full" style={{ width: size.width }} data-cm-photo-bubble="">
      <button
        type="button"
        onClick={onOpen}
        data-album-index={0}
        className="relative block w-full overflow-hidden rounded-[16px] border-0 bg-transparent text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)]"
        aria-label={t("cm_ui_view_photo_large")}
      >
        <div
          className="relative w-full overflow-hidden bg-black/10"
          style={{ height: size.height, contain: "layout" }}
        >
          {underlaySrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={underlaySrc}
              alt=""
              aria-hidden
              className={FILL_IMG}
              decoding="async"
            />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            /* 칸 크기는 위 상자가 정한다 — 사진은 그 칸을 가운데 기준으로 채우기만 한다(칸이 바뀌지 않게). */
            className={FILL_IMG}
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
              if (pending && !known && w > 0 && h > 0) {
                const nextAr = w / h;
                setPendingLoadedAr((prev) => (prev === nextAr ? prev : nextAr));
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
        <p className="mt-1 text-center sam-text-xxs text-sam-muted">{t("common_sending")}</p>
      ) : null}
    </div>
  );
}
