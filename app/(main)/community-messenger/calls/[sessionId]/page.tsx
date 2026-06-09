"use client";

import { useParams } from "next/navigation";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import {
  readActiveDirectVideoCallSessionId,
  readMinimizedCommunityCallSessionId,
} from "@/lib/community-messenger/direct-call-minimize";

/**
 * 통화 화면 — active direct 영상통화는 `CommunityMessengerActiveCallHost` 가 CallClient 를 단일 상주.
 */
export default function CommunityMessengerCallPage() {
  const params = useParams();
  const raw = params?.sessionId;
  const sessionId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  if (!sessionId) {
    return <CommunityMessengerCallRouteLoading />;
  }

  const hostOwnsSession =
    readActiveDirectVideoCallSessionId() === sessionId || readMinimizedCommunityCallSessionId() === sessionId;

  if (hostOwnsSession) {
    return null;
  }

  return <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />;
}
