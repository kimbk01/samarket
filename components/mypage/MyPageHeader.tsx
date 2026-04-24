"use client";

import { MyHubHeaderInfoHubTrigger } from "@/components/my/MyHubHeaderActions";

export function MyPageHeader() {
  return (
    <header className="sticky top-0 z-10 flex min-h-[length:var(--sam-header-row-height)] items-center justify-between border-b border-sam-border bg-sam-surface/95 px-4 py-3 backdrop-blur-[10px]">
      <h1 className="sam-text-section-title font-semibold text-sam-fg">나의 카마켓</h1>
      <MyHubHeaderInfoHubTrigger />
    </header>
  );
}
