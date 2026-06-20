"use client";

import { useEffect, useState } from "react";
import {
  getCommunityMessengerCallRuntimeSurface,
  subscribeCommunityMessengerCallRuntimeSurface,
} from "@/lib/community-messenger/call-runtime-registry";

/**
 * Call Dock 전역 호스트 — CallClient 가 동기화한 단일 dock surface 를 렌더한다.
 * (별도 VM 생성 금지)
 */
export function GlobalCallDockHost() {
  const [, surfaceTick] = useState(0);

  useEffect(() => {
    return subscribeCommunityMessengerCallRuntimeSurface(() => {
      surfaceTick((v) => v + 1);
    });
  }, []);

  const surface = getCommunityMessengerCallRuntimeSurface();
  if (surface.presentation !== "dock" || !surface.dockContent) return null;
  return <>{surface.dockContent}</>;
}
