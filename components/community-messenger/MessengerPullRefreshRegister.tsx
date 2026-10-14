"use client";

import type { DibayPtrHandler } from "@/lib/ui/ptr/dibay-ptr-ssot";
import { useLayoutEffect } from "react";
import { addMessengerPullRefreshHandler } from "@/lib/community-messenger/messenger-pull-refresh-store";

/** `/community-messenger` — PTR 시 홈 bootstrap·목록 갱신 콜백 등록 */
export function MessengerPullRefreshRegister({
  onRefresh,
}: {
  onRefresh: DibayPtrHandler;
}) {
  useLayoutEffect(() => {
    return addMessengerPullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
