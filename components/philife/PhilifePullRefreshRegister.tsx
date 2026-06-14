"use client";

import { useLayoutEffect } from "react";
import { addPhilifePullRefreshHandler } from "@/lib/philife/philife-pull-refresh-store";

/** `/philife` — PTR 시 피드·캐시 갱신 콜백 등록 */
export function PhilifePullRefreshRegister({
  onRefresh,
}: {
  onRefresh: () => void | Promise<void>;
}) {
  useLayoutEffect(() => {
    return addPhilifePullRefreshHandler(onRefresh);
  }, [onRefresh]);

  return null;
}
