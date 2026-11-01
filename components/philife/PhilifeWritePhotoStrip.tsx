"use client";

import { Camera, Loader2, X } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

const TILE = "relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect";

/**
 * 글쓰기 사진 줄 — 기존 편집기 사진 · 새 편집기에서 수정하는 글의 「기존 첨부 사진」(삭제만).
 * 새 사진은 작성기 아래 도구줄 사진 단추로 넣는다(`docs/philife-write-composer-ssot.md`).
 * 아이콘은 지금 lucide 선 아이콘, 글자색만.
 */
export function PhilifeWritePhotoStrip({
  urls,
  max,
  uploading,
  onAdd,
  onRemove,
  labels,
  showAdd = true,
  showCover = true,
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
  };
  showAdd?: boolean;
  /** 첫 장 「대표」 표시 */
  showCover?: boolean;
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
          className={`${TILE} flex flex-col items-center justify-center gap-1 border border-dashed border-sam-border bg-sam-surface-muted transition-colors active:bg-sam-app disabled:opacity-60`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-sam-muted" aria-hidden />
          ) : (
            <Camera className="h-6 w-6 stroke-[1.5] text-sam-muted" aria-hidden />
          )}
          <span className="sam-text-xxs font-medium tabular-nums">
            {uploading ? labels.uploading : `${urls.length}/${max}`}
          </span>
        </button>
      ) : null}
      {urls.map((url, i) => (
        <div key={url} className={`${TILE} bg-sam-surface-muted ring-1 ring-sam-border-soft`}>
          <SamarketThumbnail src={url} alt="" fill roundedClassName="rounded-ui-rect" imageClassName="object-cover" />
          {i === 0 && showCover ? (
            <span className="sam-text-xxs pointer-events-none absolute inset-x-0 bottom-0 bg-sam-fg/55 py-0.5 text-center font-medium !text-sam-on-primary">
              {labels.cover}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={labels.remove}
            className="absolute right-0 top-0 z-10 flex h-11 w-11 items-start justify-end p-1"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sam-fg/60 text-sam-on-primary">
              <X className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
