"use client";

import type { ReactNode } from "react";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export function MyInfoHeader({
  title = "내정보",
  backHref = "/philife",
  rightSlot,
}: {
  title?: string;
  backHref?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <MySubpageHeader
      title={title}
      backHref={backHref}
      preferHistoryBack
      hideCtaStrip
      showHubQuickActions={rightSlot == null}
      rightSlot={rightSlot}
    />
  );
}

