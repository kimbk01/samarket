/**
 * Phase 11A — Domain Bootstrap API Disabled Gate.
 * cutover OFF + production 요청 → 503 (정상 200 [] 금지).
 * isolated QA header 로만 Loader 검증 허용.
 */
import { NextResponse } from "next/server";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { PHASE1_DEFAULT_CUTOVER } from "@/lib/messenger/contracts/cutover";

export const PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING = false as const;

/** isolated harness / QA only — production UI 는 이 헤더를 보내지 않음 */
export const DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER =
  "x-dibay-messenger-domain-api" as const;
export const DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE = "isolated" as const;

export const DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED =
  "dibay_messenger_domain_api_not_enabled" as const;

export type DomainBootstrapApiAccessMode = "production_disabled" | "isolated";

export function getDomainCutoverMode(domain: ChatDomain): "off" | "on" {
  const row = PHASE1_DEFAULT_CUTOVER.find((c) => c.domain === domain);
  return row?.mode ?? "off";
}

export function resolveDomainBootstrapApiAccessMode(
  request: Request
): DomainBootstrapApiAccessMode {
  const header = request.headers.get(DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER)?.trim().toLowerCase();
  if (header === DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE) {
    return "isolated";
  }
  return "production_disabled";
}

export function domainBootstrapApiDisabledResponse(domain: ChatDomain): NextResponse {
  return NextResponse.json(
    {
      error: DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED,
      code: DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED,
      domain,
      cutoverState: getDomainCutoverMode(domain),
    },
    { status: 503 }
  );
}

export function assertPhase11aLoaderWiringOff(): void {
  if (PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING) {
    throw new Error("dibay_phase11a_loader_production_wiring_must_remain_false");
  }
}
