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
}: {
  title: string;
  children?: ReactNode;
  /** default: 매장 설정 등 공통 — narrow: 상단 카테고리·탭 스트립과 동일(내부만 px-2, 폼은 px-0으로 한 겹) */
  pad?: "default" | "narrow";
}) {
  const hasBody = children != null && children !== false;

  const headerPad =
    pad === "narrow" ? "px-2 py-2 sm:px-2" : "px-3 py-3 sm:px-4";
  const bodyPad =
    pad === "narrow" ? "space-y-2 px-2 py-2 sm:px-2 sm:py-2" : "space-y-4 p-3 sm:p-4";

  return (
    <section className="owner-store-admin-dash-section overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      <div
        className={`owner-store-admin-dash-section__header flex flex-wrap items-start justify-between gap-2 ${headerPad}`}
      >
        <h2 className="text-[15px] font-bold leading-snug tracking-tight text-sam-fg">{title}</h2>
      </div>
      {hasBody ?
        <div className={`owner-store-admin-dash-section__body font-normal ${bodyPad}`}>{children}</div>
      : null}
    </section>
  );
}
