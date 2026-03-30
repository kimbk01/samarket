"use client";

import type { ChatHubSegment } from "@/lib/chats/surfaces/chat-hub-segment";
import { ChatsPhilifeHubMainTier1Sync } from "@/components/chats/ChatsPhilifeHubMainTier1Sync";

/**
 * 레거시 이름 — 전역 1단(`AppStickyHeader`)과 맞추며 실제 UI는 `ChatsPhilifeHubMainTier1Sync`에 위임.
 * 오래된 import·캐시가 이 경로를 참조해도 빌드가 깨지지 않게 유지한다.
 */
export function ChatsHubStickyAppBar({ segment }: { segment: ChatHubSegment }) {
  if (segment === "community") {
    return <ChatsPhilifeHubMainTier1Sync />;
  }
  return null;
}
