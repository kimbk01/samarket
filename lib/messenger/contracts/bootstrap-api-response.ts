/**
 * Phase 6 — Domain Bootstrap 응답 빌더 (서버 assert + ListPort).
 * API routes · 테스트 harness 공용. production UI 호출 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  assertBootstrapRowsOwnDomainOnly,
  DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
  type DomainBootstrapEnvelopeMeta,
  type DomainSnapshotKind,
  type DomainTombstone,
} from "@/lib/messenger/contracts/domain-bootstrap-cache";

export type DomainBootstrapApiResponse<TRow, THub = null> = DomainBootstrapEnvelopeMeta & {
  rows: ReadonlyArray<TRow>;
  tombstones: ReadonlyArray<DomainTombstone>;
  hub: THub;
};

export function buildDomainBootstrapApiResponse<TRow, THub = null>(input: {
  domain: ChatDomain;
  viewerUserId: string;
  generation: string;
  snapshotKind: DomainSnapshotKind;
  rows: ReadonlyArray<TRow & { chatDomain?: string | null; domainIdentityKey?: string | null; roomId?: string }>;
  tombstones?: ReadonlyArray<DomainTombstone>;
  hub?: THub;
  nextCursor?: string | null;
}): DomainBootstrapApiResponse<TRow, THub> {
  assertBootstrapRowsOwnDomainOnly(input.domain, input.rows);
  const tombstones = input.tombstones ?? [];
  for (const t of tombstones) {
    if (t.domain !== input.domain) {
      throw new Error(`dibay_bootstrap_tombstone_foreign_domain:${t.domain}`);
    }
  }
  return {
    domain: input.domain,
    viewerUserId: input.viewerUserId.trim(),
    generation: input.generation.trim() || "0",
    snapshotKind: input.snapshotKind,
    producedAt: new Date().toISOString(),
    schemaVersion: DOMAIN_BOOTSTRAP_SCHEMA_VERSION,
    nextCursor: input.nextCursor ?? null,
    pagination: {
      nextCursor: input.nextCursor ?? null,
      hasMore: Boolean(input.nextCursor),
    },
    rows: input.rows,
    tombstones,
    hub: (input.hub ?? null) as THub,
  };
}

export type DomainBootstrapPermissionFailure = Readonly<{
  roomId: string;
  code: "forbidden" | "not_found";
  reason: string;
}>;

export class DomainBootstrapHttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
