"use client";

import type { ReactNode } from "react";

/**
 * 매장 운영 대시보드 서브폼(기본 정보·매장 설정 등) 공통 카드형 섹션.
 * 헤더 배경: #DBEDF5 통일.
 */
export function OwnerStoreAdminDashSection({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  const hasBody = children != null && children !== false;

  return (
    <section className="owner-store-admin-dash-section overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface shadow-sm">
      <div className="owner-store-admin-dash-section__header flex flex-wrap items-start justify-between gap-2 px-3 py-3 sm:px-4">
        <h2 className="text-[15px] font-bold leading-snug tracking-tight text-sam-fg">{title}</h2>
      </div>
      {hasBody ?
        <div className="owner-store-admin-dash-section__body space-y-4 p-3 sm:p-4 font-normal">{children}</div>
      : null}
    </section>
  );
}
