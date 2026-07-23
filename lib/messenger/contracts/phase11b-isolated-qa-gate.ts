/**
 * Phase 11B — Isolated QA gate (secret + isolated mode).
 * 클라이언트 임의 "isolated" 문자열만으로는 FAIL.
 * 서버 env QA secret 미설정 시 HTTP isolated 경로 영구 불가 → harness 직접 Loader 호출만.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER,
  DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE,
  DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED,
  PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING,
  domainBootstrapApiDisabledResponse,
  getDomainCutoverMode,
} from "@/lib/messenger/contracts/phase11a-domain-api-gate";

export const PHASE11B_LIVE_LOADER_PRODUCTION_WIRING = false as const;
export const PHASE11B_PERSISTENT_CACHE_WRITE = false as const;
export const PHASE11B_REALTIME_PUBLISH = false as const;

/** shared secret header — must match server env */
export const DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER =
  "x-dibay-messenger-domain-api-qa-secret" as const;

export const DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV =
  "DIBAY_MESSENGER_DOMAIN_API_QA_SECRET" as const;

export type Phase11bApiAccessMode =
  | "production_disabled"
  | "isolated_authorized"
  | "isolated_rejected_no_secret_env"
  | "isolated_rejected_bad_secret"
  | "isolated_rejected_missing_mode";

function safeEqualStrings(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function readPhase11bQaSecretFromEnv(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const v = env[DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_ENV]?.trim();
  return v && v.length >= 16 ? v : null;
}

/**
 * Isolated HTTP 허용: (1) mode header = isolated (2) QA secret header = env secret
 * 둘 중 하나라도 없으면 production_disabled / reject.
 */
export function resolvePhase11bApiAccessMode(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): Phase11bApiAccessMode {
  const mode = request.headers.get(DIBAY_MESSENGER_DOMAIN_API_ISOLATED_HEADER)?.trim().toLowerCase();
  const provided = request.headers.get(DIBAY_MESSENGER_DOMAIN_API_QA_SECRET_HEADER)?.trim() ?? "";
  const expected = readPhase11bQaSecretFromEnv(env);

  if (mode !== DIBAY_MESSENGER_DOMAIN_API_ISOLATED_VALUE) {
    if (provided) return "isolated_rejected_missing_mode";
    return "production_disabled";
  }
  if (!expected) return "isolated_rejected_no_secret_env";
  if (!provided || !safeEqualStrings(provided, expected)) {
    return "isolated_rejected_bad_secret";
  }
  return "isolated_authorized";
}

export function phase11bApiGateResponse(
  domain: ChatDomain,
  mode: Phase11bApiAccessMode
): NextResponse | null {
  if (mode === "isolated_authorized") return null;
  if (mode === "production_disabled") {
    return domainBootstrapApiDisabledResponse(domain);
  }
  const code =
    mode === "isolated_rejected_no_secret_env"
      ? "dibay_messenger_domain_api_qa_secret_not_configured"
      : mode === "isolated_rejected_bad_secret"
        ? "dibay_messenger_domain_api_qa_secret_invalid"
        : "dibay_messenger_domain_api_isolated_mode_required";
  return NextResponse.json(
    {
      error: code,
      code,
      domain,
      cutoverState: getDomainCutoverMode(domain),
      /** 임의 isolated 문자열 우회 실패 */
      reason: mode,
    },
    { status: 503 }
  );
}

export function assertPhase11bLiveConstraints(): void {
  if (PHASE11A_DOMAIN_LOADER_PRODUCTION_WIRING || PHASE11B_LIVE_LOADER_PRODUCTION_WIRING) {
    throw new Error("dibay_phase11b_live_loader_production_wiring_forbidden");
  }
  if (PHASE11B_PERSISTENT_CACHE_WRITE || PHASE11B_REALTIME_PUBLISH) {
    throw new Error("dibay_phase11b_cache_or_realtime_write_forbidden");
  }
}

export { DIBAY_MESSENGER_DOMAIN_API_NOT_ENABLED };
