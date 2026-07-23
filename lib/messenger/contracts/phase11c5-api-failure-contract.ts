/**
 * Phase 11C.5 — Domain API 실패 / 503 Empty 오인 금지 계약.
 * HTTP 500/503/timeout → rows=[] 변환 FAIL.
 * cache wipe / shell 정상 빈 목록 오인 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { DomainPersistentCachePort } from "@/lib/messenger/contracts/persistent-cache-port";

export type DomainApiFailureKind = "http_503" | "http_500" | "timeout" | "unauthorized" | "forbidden";

export type DomainApiFailure = Readonly<{
  kind: DomainApiFailureKind;
  domain: ChatDomain;
  status?: number;
  code?: string;
  message?: string;
}>;

export type DomainShellLoadState =
  | { status: "ok"; rowCount: number }
  | { status: "error"; failure: DomainApiFailure }
  | { status: "loading" };

/**
 * Bootstrap/API 실패를 정상 빈 snapshot 으로 해석하면 FAIL.
 */
export function assertDomainApiFailureNotEmptySuccess(input: {
  failure: DomainApiFailure | null;
  interpretedAsEmptyRows: boolean;
}): void {
  if (input.failure && input.interpretedAsEmptyRows) {
    throw new Error(
      `dibay_phase11c5_failure_as_empty_forbidden:${input.failure.domain}:${input.failure.kind}`
    );
  }
}

/**
 * 실패 시 기존 cache 를 빈 목록으로 덮지 않음.
 * canary: 명시적 error 상태만 기록.
 */
export function applyDomainApiFailureWithoutCacheWipe<TRow extends { roomId: string; domainIdentityKey: string }>(input: {
  cache: DomainPersistentCachePort<TRow>;
  cacheKey: string;
  failure: DomainApiFailure;
  wipeCacheWithEmpty: boolean;
}): DomainShellLoadState {
  if (input.wipeCacheWithEmpty) {
    throw new Error(`dibay_phase11c5_cache_wipe_on_failure_forbidden:${input.failure.domain}`);
  }
  const existing = input.cache.readSnapshot(input.cacheKey);
  void existing; // preserved — do not write
  return { status: "error", failure: input.failure };
}

export function mergeShellDomainStates(input: {
  domains: ReadonlyArray<{ domain: ChatDomain; state: DomainShellLoadState }>;
}): Readonly<{
  okDomains: ReadonlyArray<ChatDomain>;
  errorDomains: ReadonlyArray<ChatDomain>;
  /** 실패한 Domain 을 다른 Domain rows 와 병합했는지 */
  mergedLegacyFallback: false;
}> {
  const okDomains: ChatDomain[] = [];
  const errorDomains: ChatDomain[] = [];
  for (const d of input.domains) {
    if (d.state.status === "ok") okDomains.push(d.domain);
    if (d.state.status === "error") errorDomains.push(d.domain);
  }
  return { okDomains, errorDomains, mergedLegacyFallback: false };
}

export function parseBootstrapHttpOutcome(input: {
  domain: ChatDomain;
  httpStatus: number;
  timedOut?: boolean;
}):
  | { ok: true }
  | { ok: false; failure: DomainApiFailure } {
  if (input.timedOut) {
    return {
      ok: false,
      failure: { kind: "timeout", domain: input.domain, message: "timeout" },
    };
  }
  if (input.httpStatus === 503) {
    return {
      ok: false,
      failure: {
        kind: "http_503",
        domain: input.domain,
        status: 503,
        code: "dibay_messenger_domain_api_not_enabled",
      },
    };
  }
  if (input.httpStatus === 401) {
    return {
      ok: false,
      failure: { kind: "unauthorized", domain: input.domain, status: 401 },
    };
  }
  if (input.httpStatus === 403) {
    return {
      ok: false,
      failure: { kind: "forbidden", domain: input.domain, status: 403 },
    };
  }
  if (input.httpStatus >= 500) {
    return {
      ok: false,
      failure: { kind: "http_500", domain: input.domain, status: input.httpStatus },
    };
  }
  if (input.httpStatus >= 200 && input.httpStatus < 300) {
    return { ok: true };
  }
  return {
    ok: false,
    failure: {
      kind: "http_500",
      domain: input.domain,
      status: input.httpStatus,
      message: "unexpected_status",
    },
  };
}
