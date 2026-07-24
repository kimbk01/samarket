/**
 * 4-domain separation — gated correlation logs (QA / debug only).
 * Enable: SAMARKET_MESSENGER_TRACE_LOG=1 or NEXT_PUBLIC_MESSENGER_PERF_TRACE=1
 */

import { messengerTraceConsoleDebug } from "@/lib/community-messenger/messenger-trace-console";

export type DomainSeparationTraceEvent = {
  correlationId: string;
  phase: string;
  [key: string]: unknown;
};

export function newDomainSeparationCorrelationId(): string {
  return `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function traceDomainSeparation(event: DomainSeparationTraceEvent): void {
  messengerTraceConsoleDebug("[domain-separation]", event);
}
