"use client";

/** browse 카드 메뉴 미리보기 deferred 로딩 — legacy 116px 3-up · category WP5 4:3 가로 줄 */
const LEGACY_BAND_H = "h-[116px]";

type StoreBrowseFeaturedMenuSkeletonProps = {
  variant?: "legacy" | "category";
};

export function StoreBrowseFeaturedMenuSkeleton({
  variant = "legacy",
}: StoreBrowseFeaturedMenuSkeletonProps) {
  if (variant === "category") {
    /** WP5 — 가로 사진 줄(`.stores-category-menu-strip`) 안에서 같은 4:3 칸으로 자리 유지 */
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="stores-category-menu-strip__item bg-[color:var(--delivery-bg-muted)]"
            data-store-browse-menu-pending="true"
            aria-hidden
          />
        ))}
      </>
    );
  }

  return (
    <div
      className={`flex min-h-[116px] snap-x snap-mandatory gap-1 overflow-hidden ${LEGACY_BAND_H}`}
      aria-hidden
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={[
            "shrink-0 snap-start overflow-hidden",
            "w-[calc((100%-8px)/3)]",
            LEGACY_BAND_H,
            "bg-[color:var(--delivery-bg-muted)]",
          ].join(" ")}
          data-store-browse-menu-pending="true"
        />
      ))}
    </div>
  );
}
