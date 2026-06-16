"use client";

import { CallProvider } from "@/app/_providers/CallProvider";
import { CallHost } from "@/components/call/CallHost";

/** 수신 통화 오버레이 — DIBAY call runtime CallHost */
export function CallIncomingChrome() {
  return (
    <CallProvider>
      <CallHost />
    </CallProvider>
  );
}
