"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";

const CallScreen = dynamic(
  () => importWithChunkRetry(() => import("@/components/call/CallScreen").then((m) => m.CallScreen)),
  { ssr: false, loading: () => <CommunityMessengerCallRouteLoading /> }
);

/** 통화 화면 — DIBAY call runtime CallScreen */
export default function CommunityMessengerCallPage() {
  const params = useParams();
  const raw = params?.sessionId;
  const sessionId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();

  if (!sessionId) {
    return <CommunityMessengerCallRouteLoading />;
  }

  return <CallScreen sessionId={sessionId} />;
}
