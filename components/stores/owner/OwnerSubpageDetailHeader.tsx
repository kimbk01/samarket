"use client";

import { DetailHeader } from "@/components/layout/sector-header";

export function OwnerSubpageDetailHeader({
  title,
  backHref,
  preferHistoryBack = false,
}: {
  title: string;
  backHref: string;
  preferHistoryBack?: boolean;
}) {
  return (
    <DetailHeader
      title={title}
      backHref={backHref}
      preferHistoryBack={preferHistoryBack}
    />
  );
}
