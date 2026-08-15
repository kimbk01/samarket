"use client";

import { useLayoutEffect } from "react";
import { addMypagePullRefreshHandler } from "@/lib/mypage/mypage-pull-refresh-store";

/** `/mypage` hub — PTR refresh callback 등록 (existing home model only) */
export function MypagePullRefreshRegister({
  onRefresh,
}: {
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    return addMypagePullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
