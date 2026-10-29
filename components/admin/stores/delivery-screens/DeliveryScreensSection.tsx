"use client";

import type { ReactNode } from "react";

/** 5-F — 허브의 「앱 화면 구역」 행: 순번 · 구역 이름 · 현재 상태 요약 · 편집 본문. */
export function DeliveryScreensSection({
  index,
  title,
  desc,
  status,
  actions,
  children,
  sectionKey,
}: {
  index: number;
  title: string;
  desc?: string;
  status?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  sectionKey: string;
}) {
  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-white"
      data-delivery-screens-section={sectionKey}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sam-border px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-sam-muted">{index}</p>
          <h2 className="text-[16px] font-bold text-sam-fg">{title}</h2>
          {desc ? <p className="mt-0.5 text-[12px] text-sam-muted">{desc}</p> : null}
          {status ? <div className="mt-2 flex flex-wrap gap-2 text-[12px]">{status}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="p-4">{children}</div> : null}
    </section>
  );
}

/** 현황 칩 (숫자·켜짐/꺼짐). */
export function DeliveryScreensStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-2 py-1 text-[12px] text-sam-fg">
      <span className="text-sam-muted">{label}</span> <span className="font-semibold">{value}</span>
    </span>
  );
}
