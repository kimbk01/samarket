"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";

const CommunityMessengerCallClient = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerCallClient").then(
      (m) => m.CommunityMessengerCallClient
    ),
  { ssr: false, loading: () => <CommunityMessengerCallRouteLoading /> }
);

/**
 * 통화 화면은 발신 직후 `sessionStorage` 시드 + 클라 GET으로 충분하다.
 * `ssr:false` 로 첫 페인트부터 시드를 동기 소비해 로딩·권한 대기 없이 벨/연결 UI 로 진입한다.
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
