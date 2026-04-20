"use client";

import { useParams } from "next/navigation";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";

/**
 * 통화 화면은 발신 직후 `sessionStorage` 시드 + 클라 GET으로 충분하다.
 * RSC에서 DB 세션을 await 하면 Suspense·TTFB가 길어져 「영상 선택 → 화면 전환」이 느려진다.
 */
export default function CommunityMessengerCallPage() {
  const params = useParams();
  const raw = params?.sessionId;
  const sessionId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  if (!sessionId) {
    return <CommunityMessengerCallRouteLoading />;
  }
  return <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />;
}
