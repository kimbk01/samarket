/**
 * Phase 6/11A — Domain Bootstrap HTTP route 공용.
 * production: Disabled 503 gate. isolated: registered Loader only.
 * production cache write / UI cutover 금지.
 */
import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { DomainBootstrapHttpError } from "@/lib/messenger/contracts/bootstrap-api-response";
import { PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING } from "@/lib/messenger/contracts/domain-bootstrap-cache";
import {
  assertPhase11aLoaderWiringOff,
} from "@/lib/messenger/contracts/phase11a-domain-api-gate";
import {
  assertPhase11bLiveConstraints,
  phase11bApiGateResponse,
  resolvePhase11bApiAccessMode,
} from "@/lib/messenger/contracts/phase11b-isolated-qa-gate";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export async function withDomainBootstrapAuth(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  assertPhase11aLoaderWiringOff();
  assertPhase11bLiveConstraints();
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized", code: "unauthorized" }, { status: 401 }),
    };
  }
  if (PHASE6_DOMAIN_CACHE_PRODUCTION_WIRING) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "phase6_cache_wiring_must_remain_false", code: "phase6_forbidden" },
        { status: 500 }
      ),
    };
  }
  return { ok: true, userId: auth.userId };
}

/**
 * Phase 11B: production → 503.
 * isolated 는 QA secret env + secret header + mode header 동시 충족 시에만.
 * 임의 "isolated" 문자열 우회 불가.
 */
export function gateDomainBootstrapApiRequest(
  request: Request,
  domain: ChatDomain
):
  | { ok: true; mode: "isolated" }
  | { ok: false; response: NextResponse } {
  assertPhase11aLoaderWiringOff();
  assertPhase11bLiveConstraints();
  const access = resolvePhase11bApiAccessMode(request);
  const denied = phase11bApiGateResponse(domain, access);
  if (denied) return { ok: false, response: denied };
  return { ok: true, mode: "isolated" };
}

export function domainBootstrapErrorResponse(err: unknown): NextResponse {
  if (err instanceof DomainBootstrapHttpError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "bootstrap_failed";
  if (message.includes("foreign_domain") || message.includes("dibay_bootstrap_foreign")) {
    return NextResponse.json({ error: message, code: "foreign_domain" }, { status: 500 });
  }
  if (message.includes("duplicate_identity") || message.includes("dibay_loader_duplicate_identity")) {
    return NextResponse.json({ error: message, code: "identity_duplicate" }, { status: 500 });
  }
  if (message.includes("_forbidden") || message.includes("loader_forbidden")) {
    return NextResponse.json({ error: message, code: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: message, code: "bootstrap_failed" }, { status: 500 });
}

/**
 * @deprecated Phase 11A — empty 200 [] 금지. production 경로에서 사용하지 말 것.
 * isolated harness 는 Domain Loader / fixture source 를 등록해 사용.
 */
export function createPhase6EmptyBootstrapSource(): {
  loadRooms: (viewerUserId: string) => Promise<ReadonlyArray<never>>;
} {
  throw new Error("dibay_phase11a_empty_bootstrap_source_forbidden");
}

export function isolatedSourceMissingResponse(domain: ChatDomain): NextResponse {
  return NextResponse.json(
    {
      error: "dibay_messenger_domain_api_isolated_source_missing",
      code: "dibay_messenger_domain_api_isolated_source_missing",
      domain,
      cutoverState: "off",
    },
    { status: 503 }
  );
}
