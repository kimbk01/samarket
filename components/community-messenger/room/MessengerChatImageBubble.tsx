"use client";

import { useEffect, useState } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const BUBBLE_MAX =
  "mx-auto w-full min-w-[140px] max-w-[min(72vw,280px)] sm:max-w-[min(72vw,300px)] md:max-w-[min(72vw,360px)]";

function clampAspectRatio(n: number): number {
  return Math.min(1.5, Math.max(0.75, n));
}

export function MessengerChatImageBubble(props: {
  item: CommunityMessengerMessage & { pending?: boolean };
  onOpenLightbox: (urls: string[], originals: string[], index: number) => void;
}) {
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
      <div className={`${BUBBLE_MAX} max-h-[360px]`}>
        <AlbumLayout urls={album} pending={pending} onOpenCell={openFrom} />
        {pending ? (
          <p
            className={`mt-1 text-center text-[11px] ${item.isMine ? "text-white/85" : "text-sam-muted"}`}
          >
            전송 중…
          </p>
        ) : null}
      </div>
    );
  }

  return <SingleChatImage src={item.content.trim()} pending={pending} isMine={item.isMine} onOpen={() => openFrom(0)} />;
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
  const n = urls.length;
  const restCount = n > 4 ? n - 4 : 0;

  const cell = (src: string, i: number, className: string) => (
    <button
      key={i}
      type="button"
      className={`relative overflow-hidden bg-black/10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)] ${className}`}
      onClick={() => onOpenCell(i)}
      aria-label={`사진 ${i + 1} 크게 보기`}
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
      <div className="grid aspect-[4/3] max-h-[360px] w-full grid-cols-2 gap-1 overflow-hidden rounded-2xl border border-black/[0.06] bg-black/[0.04] p-1">
        {cell(urls[0]!, 0, "rounded-lg")}
        {cell(urls[1]!, 1, "rounded-lg")}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className="grid max-h-[360px] w-full grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl border border-black/[0.06] bg-black/[0.04] p-1">
        {cell(urls[0]!, 0, "row-span-2 h-full min-h-0 rounded-lg")}
        {cell(urls[1]!, 1, "rounded-lg")}
        {cell(urls[2]!, 2, "rounded-lg")}
      </div>
    );
  }

  if (n === 4) {
    return (
      <div className="aspect-square max-h-[360px] w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-black/[0.04] p-1">
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-1">
          {urls.slice(0, 4).map((src, i) => cell(src, i, "rounded-lg"))}
        </div>
      </div>
    );
  }

  return (
    <div className="aspect-square max-h-[360px] w-full overflow-hidden rounded-2xl border border-black/[0.06] bg-black/[0.04] p-1">
      <div className="grid h-full grid-cols-2 grid-rows-2 gap-1">
        {cell(urls[0]!, 0, "rounded-lg")}
        {cell(urls[1]!, 1, "rounded-lg")}
        {cell(urls[2]!, 2, "rounded-lg")}
        <button
          type="button"
          className="relative overflow-hidden rounded-lg bg-black/15 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)]"
          onClick={() => onOpenCell(4)}
          aria-label={`외 ${restCount}장 보기`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={urls[3]!}
            alt=""
            className={`h-full w-full object-cover ${pending ? "blur-sm opacity-70" : ""}`}
            loading="lazy"
            decoding="async"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[17px] font-bold text-white">
            +{restCount}
          </span>
        </button>
      </div>
    </div>
  );
}

function SingleChatImage({
  src,
  pending,
  isMine,
  onOpen,
}: {
  src: string;
  pending?: boolean;
  isMine: boolean;
  onOpen: () => void;
}) {
  const [ar, setAr] = useState<number | null>(null);
  useEffect(() => {
    setAr(null);
  }, [src]);
  const ratio = ar != null ? clampAspectRatio(ar) : 4 / 5;
  return (
    <div className={BUBBLE_MAX}>
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full overflow-hidden rounded-2xl border border-black/[0.06] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--cm-room-primary)]"
        aria-label="사진 크게 보기"
      >
        <div className="relative max-h-[360px] w-full overflow-hidden" style={{ aspectRatio: ratio }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className={`h-full w-full object-cover ${pending ? "scale-105 blur-sm opacity-75" : ""}`}
            loading="lazy"
            decoding="async"
            onLoad={(e) => {
              const el = e.currentTarget;
              const w = el.naturalWidth;
              const h = el.naturalHeight;
              if (w > 0 && h > 0) setAr(w / h);
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
        <p className={`mt-1 text-center text-[11px] ${isMine ? "text-white/85" : "text-sam-muted"}`}>전송 중…</p>
      ) : null}
    </div>
  );
}
