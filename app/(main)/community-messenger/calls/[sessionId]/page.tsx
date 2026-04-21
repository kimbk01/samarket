"use client";

import { useParams } from "next/navigation";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";

/**
 * 통화 화면은 발신 직후 `sessionStorage` 시드 + 클라 GET으로 충분하다.
 * `dynamic(loading:…)` 청크 대기 UI 가 실제 통화 UI 와 겹쳐 보이는 이중 전환을 만들어 정적 import로 통일한다.
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
