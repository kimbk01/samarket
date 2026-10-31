"use client";

import { PostBodyImage, PostImageGridCellImage } from "@/components/community/post-detail/PostBodyImage";
import { postImageGridLayout } from "@/lib/community/post-image-display";

const SPAN_CLASS = { full: "col-span-6", half: "col-span-3", third: "col-span-2" } as const;

/**
 * 첨부 사진(본문에 넣지 않은 사진) — 페이스북형 배치.
 * 1장: 원본 비율 한 장 · 2장: 나란히 · 3장: 위 1 + 아래 2 · 4장: 2×2 · 5장 이상: 위 2 + 아래 3, 마지막 칸 「+n」.
 * 칸은 aspect-ratio 로 크기가 정해져 로드 전에도 자리가 잡힌다. 전체 사진은 뷰어에서 본다.
 */
export function PostImageGrid({
  urls,
  onOpen,
  labelFor,
}: {
  urls: string[];
  onOpen: (index: number) => void;
  labelFor: (index: number) => string;
}) {
  const layout = postImageGridLayout(urls.length);
  if (urls.length === 0) return null;
  if (layout.kind === "single") {
    return <PostBodyImage src={urls[0]!} label={labelFor(0)} onOpen={() => onOpen(0)} priority />;
  }
  const lastCell = layout.cells[layout.cells.length - 1]!;
  return (
    <div className="grid grid-cols-6 gap-0.5 overflow-hidden rounded-ui-rect" data-testid="post-image-grid" data-count={urls.length}>
      {layout.cells.map((cell) => (
        <PostImageGridCellImage
          key={`${urls[cell.index]}-${cell.index}`}
          src={urls[cell.index]!}
          surface={cell.shape === "wide" ? "detail" : "cell"}
          label={labelFor(cell.index)}
          onOpen={() => onOpen(cell.index)}
          priority={cell.index < 2}
          className={`${SPAN_CLASS[cell.span]} ${cell.shape === "wide" ? "aspect-[2/1]" : "aspect-square"}`}
          overlay={
            cell === lastCell && layout.hiddenCount > 0 ? (
              <span
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-[26px] font-semibold text-white"
                data-testid="post-image-grid-more"
              >
                +{layout.hiddenCount}
              </span>
            ) : null
          }
        />
      ))}
    </div>
  );
}
