"use client";

import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";

/** 주문 상세 등 — `CommerceCartHeaderLink` + 알림음 토글·설정(내정보 허브와 동일) */
export function CommerceCartHubHeaderRight() {
  return (
    <div className="flex max-w-[calc(100vw-120px)] shrink-0 items-center justify-end gap-0.5 sm:max-w-none">
      <CommerceCartHeaderLink />
      <MyHubHeaderActions />
    </div>
  );
}
