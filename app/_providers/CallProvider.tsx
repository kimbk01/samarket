"use client";

/**
 * 통화·메신저 표면 맥락(URL 기반 방 ID).
 * 사운드/정책 API는 `GlobalCommunityMessengerIncomingCall`·벨 재생 시점 한 번만
 * `fetchMessengerCallSoundConfig`(클라이언트 단일 인플라이트)로 로드 — 중복 GET 방지.
 */

import type { ReactNode } from "react";
import { CommunityCallSurfaceProvider } from "@/contexts/CommunityCallSurfaceContext";

export function CallProvider({ children }: { children: ReactNode }) {
  return <CommunityCallSurfaceProvider>{children}</CommunityCallSurfaceProvider>;
}

export { useCommunityCallSurface as useCallSurface } from "@/contexts/CommunityCallSurfaceContext";
