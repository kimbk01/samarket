"use client";

/** 스티커 그리드 전용 — loading=lazy, 고정 크기로 CLS 최소화 */
export function MessengerStickerLazyImage({
  src,
  alt,
  onActivate,
}: {
  src: string;
  alt: string;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-ui-rect bg-sam-surface-muted/80 p-1.5 transition active:scale-95"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={72}
        height={72}
        loading="lazy"
        decoding="async"
        className="h-[4.25rem] w-[4.25rem] object-contain"
      />
    </button>
  );
}
