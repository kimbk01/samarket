"use client";

import { useParams } from "next/navigation";
import { CallV3Screen } from "@/components/community-messenger/call-v3/CallV3Screen";

export default function CommunityMessengerCallV3Page() {
  const params = useParams();
  const raw = params?.callId;
  const callId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();

  if (!callId) {
    return null;
  }

  return <CallV3Screen callId={callId} />;
}
