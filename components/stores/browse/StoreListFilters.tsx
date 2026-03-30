"use client";

import Link from "next/link";

export type StoreBrowseSortId = "default" | "distance" | "rating" | "reviews" | "fast";

const SORTS: { id: StoreBrowseSortId; label: string }[] = [
  { id: "default", label: "기본순" },
  { id: "distance", label: "가까운순" },
  { id: "rating", label: "평점순" },
  { id: "reviews", label: "리뷰많은순" },
  { id: "fast", label: "배달빠른순" },
];

const CHIP_BASE =
  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors border";
const CHIP_OFF = "border-gray-200 bg-white text-gray-600";
const CHIP_ON = "border-signature bg-signature text-white";

export function StoreListFilters({
  sort,
  onSortChange,
  hasGeo,
}: {
  sort: StoreBrowseSortId;
  onSortChange: (id: StoreBrowseSortId) => void;
  /** 위치 꺼져 있으면 가까운순 비활성 안내 */
  hasGeo: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">정렬</span>
        <div className="flex flex-wrap gap-1">
          {SORTS.map(({ id, label }) => {
            const on = sort === id;
            const disabled = id === "distance" && !hasGeo;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                title={disabled ? "동네·위치 권한을 켜면 사용할 수 있어요" : undefined}
                onClick={() => {
                  if (!disabled) onSortChange(id);
                }}
                className={`${CHIP_BASE} ${on ? CHIP_ON : CHIP_OFF} ${
                  disabled ? "cursor-not-allowed opacity-45" : ""
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <Link
        href="/regions"
        className="inline-flex items-center rounded-full border border-dashed border-gray-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-700 active:bg-gray-50"
      >
        지역·동네 설정
      </Link>
    </div>
  );
}
