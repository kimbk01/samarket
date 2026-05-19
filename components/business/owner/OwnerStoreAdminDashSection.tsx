"use client";

import type { ReactNode } from "react";

/**
 * 매장 운영 대시보드 서브폼(기본 정보·매장 설정 등) 공통 카드형 섹션.
 * 헤더 배경: #DBEDF5 통일.
 */
export function OwnerStoreAdminDashSection({
  title,
  children,
  pad = "default",
  /** 기본: 흰 카드. muted / emphasized / bizSoft: 배경 변형 */
  surfaceTone = "default",
  /** 지정 시 `<section>`에 합쳐짐. `border-0` 등으로 기본 테두리·그림자를 덮어쓸 때 사용 */
  className,
}: {
  /** 비우거나 생략하면 헤더(제목 줄)를 렌더하지 않습니다. */
  title?: string;
  children?: ReactNode;
  /** default: 매장 설정 등 공통 — narrow: 상단 카테고리·탭 스트립과 동일(내부만 px-2, 폼은 px-0으로 한 겹) */
  pad?: "default" | "narrow";
  surfaceTone?: "default" | "muted" | "emphasized" | "bizSoft";
  className?: string;
}) {
  const hasBody = children != null && children !== false;
  const showHeader = typeof title === "string" && title.trim() !== "";

  const headerPad =
    pad === "narrow" ? "px-2 py-2 sm:px-2" : "px-3 py-3 sm:px-4";
  const bodyPad =
    pad === "narrow" ? "space-y-2 px-2 py-2 sm:px-2 sm:py-2" : "space-y-4 p-3 sm:p-4";

  const surfaceClass =
    surfaceTone === "emphasized"
      ? "bg-sam-chat"
      : surfaceTone === "muted"
        ? "bg-sam-surface-muted"
        : surfaceTone === "bizSoft"
          ? "bg-[var(--biz-primary-soft)]"
          : "bg-sam-surface";

  const shell =
    typeof className === "string" && className.trim() !== ""
      ? className.trim()
      : "border border-sam-border-soft";

  return (
    <section
      className={`owner-store-admin-dash-section overflow-hidden rounded-ui-rect ${surfaceClass} ${shell}`}
    >
      {showHeader ? (
        <div
          className={`owner-store-admin-dash-section__header flex flex-wrap items-start justify-between gap-2 ${headerPad}`}
        >
          <h2 className="text-[15px] font-bold leading-snug tracking-tight text-sam-fg">{title}</h2>
        </div>
      ) : null}
      {hasBody ?
        <div className={`owner-store-admin-dash-section__body font-normal ${bodyPad}`}>{children}</div>
      : null}
    </section>
  );
}
