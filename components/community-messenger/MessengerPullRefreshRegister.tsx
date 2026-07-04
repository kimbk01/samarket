"use client";

import { useLayoutEffect } from "react";
import { addMessengerPullRefreshHandler } from "@/lib/community-messenger/messenger-pull-refresh-store";

/** `/community-messenger` — PTR 시 홈 bootstrap·목록 갱신 콜백 등록 */
export function MessengerPullRefreshRegister({
  onRefresh,
}: {
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    return addMessengerPullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
