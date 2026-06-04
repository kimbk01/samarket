"use client";

import { useCallback, useEffect, useState } from "react";

/** 스티커 그리드 전용 — loading=lazy, 고정 크기로 CLS 최소화 */
export function MessengerStickerLazyImage({
  src,
  alt,
  onActivate,
  onBroken,
}: {
  src: string;
  alt: string;
  onActivate: () => void;
  /** 이미지 로드 실패 시 부모가 전체 그리드 상태를 집계 */
  onBroken?: (src: string) => void;
}) {
  const [broken, setBroken] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setBroken(false);
    setReady(false);
  }, [src]);

  const markBroken = useCallback(() => {
    setBroken(true);
    setReady(false);
    onBroken?.(src);
  }, [onBroken, src]);

  const markReady = useCallback(() => {
    setReady(true);
  }, []);

  const handleClick = () => {
    if (broken || !ready) return;
    onActivate();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={broken || !ready}
      className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-ui-rect bg-sam-surface-muted/80 p-1.5 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={72}
        height={72}
        loading="lazy"
        decoding="async"
        onLoad={markReady}
        onError={markBroken}
        className={`h-[4.25rem] w-[4.25rem] object-contain ${broken ? "opacity-30" : ""}`}
      />
    </button>
  );
}
