"use client";

/**
 * 채팅 묶음 이미지 — 1장은 전폭, 2장 이상은 3열 그리드(얇은 구분선). 저장 버튼은 부모에서 이미지 왼쪽에 둠.
 */
export function ChatImageStack({ urls, alignEnd }: { urls: string[]; alignEnd: boolean }) {
  if (urls.length === 0) return null;

  const gridClass =
    urls.length === 1 ? "grid grid-cols-1 gap-0" : "grid grid-cols-3 gap-px bg-sam-surface/20 dark:bg-sam-surface/10";

  return (
    <div className={`flex min-w-0 max-w-[min(86.4vw,22.2rem)] flex-col ${alignEnd ? "items-end" : "items-start"}`}>
      <div className={`w-full overflow-hidden rounded-ui-rect ${gridClass}`}>
        {urls.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative min-h-0 min-w-0 bg-black/[0.03]">
            <img
              src={url}
              alt=""
              className={
                urls.length === 1
                  ? "max-h-[min(55vh,22rem)] w-full object-cover"
                  : "aspect-square max-h-[min(42vh,18rem)] w-full object-cover sm:max-h-[min(50vh,22rem)]"
              }
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
