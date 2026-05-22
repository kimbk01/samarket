"use client";

/** browse 카드 메뉴 미리보기 deferred 로딩 — `StoreDeliveryRowCard` 빈 메뉴(h-[116px])와 동일 높이 */
const BROWSE_MENU_BAND_H_CLASS = "h-[116px]";

export function StoreBrowseFeaturedMenuSkeleton() {
  return (
    <div
      className={`flex min-h-[116px] snap-x snap-mandatory gap-1 overflow-hidden ${BROWSE_MENU_BAND_H_CLASS}`}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={[
            "shrink-0 snap-start overflow-hidden rounded-[10px] bg-[#F3F4F6] dark:bg-[#2B2D30]",
            "w-[calc((100%-8px)/3)]",
            BROWSE_MENU_BAND_H_CLASS,
            "animate-pulse",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
