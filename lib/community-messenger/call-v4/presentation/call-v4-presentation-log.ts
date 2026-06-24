import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

export function logCallV4PipPresentation(event: string, callId: string, extra: Record<string, unknown> = {}): void {
  logCallV4(event, { callId, ...extra });
}
