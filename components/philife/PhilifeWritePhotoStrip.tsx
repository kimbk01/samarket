"use client";

import { Camera, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

const TILE = "relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect";

/**
 * 글쓰기 사진 줄 — 거래 글쓰기 `ImageUploader`(karrot) 와 같은 시각 계약:
 * 카메라 추가 타일(개수 n/max) · 80px 썸네일 · 첫 장「대표」· 원형 삭제.
 */
export function PhilifeWritePhotoStrip({
  urls,
  max,
  uploading,
  onAdd,
  onRemove,
  labels,
  showAdd = true,
  onMove,
  onInsertToBody,
}: {
  urls: string[];
  max: number;
  uploading: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  labels: {
    add: string;
    cover: string;
    remove: string;
    uploading: string;
    moveLeft?: string;
    moveRight?: string;
    toBody?: string;
  };
  showAdd?: boolean;
  /** 순서 바꾸기(첫 장 = 대표·격자 첫 칸) */
  onMove?: (index: number, dir: -1 | 1) => void;
  /** 첨부 → 본문 커서 위치로 옮기기 */
  onInsertToBody?: (index: number) => void;
}) {
  const full = urls.length >= max;
  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {showAdd ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={uploading || full}
          aria-label={labels.add}
          className={`${TILE} flex flex-col items-center justify-center gap-1 border border-dashed border-sam-border bg-sam-surface-muted transition-colors active:bg-sam-primary-soft disabled:opacity-60`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-sam-primary" aria-hidden />
          ) : (
            <Camera className="h-6 w-6 stroke-[1.5] text-sam-primary" aria-hidden />
          )}
          <span className="text-[12px] font-medium tabular-nums text-sam-muted">
            {uploading ? labels.uploading : `${urls.length}/${max}`}
          </span>
        </button>
      ) : null}
      {urls.map((url, i) => (
        <div key={url} className={`${TILE} bg-sam-surface-muted ring-1 ring-sam-border-soft`}>
          <SamarketThumbnail src={url} alt="" fill roundedClassName="rounded-ui-rect" imageClassName="object-cover" />
          {i === 0 && !onInsertToBody ? (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[11px] font-medium text-white">
              {labels.cover}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={labels.remove}
            className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
          </button>
          {onMove && urls.length > 1 ? (
            <div className="absolute left-1 top-1 z-10 flex gap-0.5">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => onMove(i, -1)}
                aria-label={labels.moveLeft}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80 disabled:opacity-30"
              >
                <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
              </button>
              <button
                type="button"
                disabled={i === urls.length - 1}
                onClick={() => onMove(i, 1)}
                aria-label={labels.moveRight}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80 disabled:opacity-30"
              >
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
              </button>
            </div>
          ) : null}
          {onInsertToBody ? (
            <button
              type="button"
              onClick={() => onInsertToBody(i)}
              className="absolute inset-x-0 bottom-0 z-10 bg-sam-primary/90 py-0.5 text-center text-[11px] font-medium text-white"
            >
              {labels.toBody}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
