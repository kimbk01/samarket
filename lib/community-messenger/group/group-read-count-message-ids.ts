import { isUuidLikeString } from "@/lib/shared/uuid-string";

/**
 * 그룹 읽음 수 조회 대상 메시지 id — 서버에 저장된 메시지(uuid)만.
 * 전송 중 낙관적 메시지 id(`pending:<room>:<n>`·`pending:image:…`)가 RPC `uuid[]` 인자에 섞이면
 * Postgres `invalid input syntax for type uuid` 로 조회 전체가 실패한다 (운영 로그 2026-11-12~13 113건,
 * `docs/audit/postgres-error-log-audit-2026-11-14.md` §2-A). 클라이언트 훅·서버 서비스가 이 함수 하나로 거른다.
 */
export function selectGroupReadCountMessageIds(messageIds: readonly unknown[], limit = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of messageIds) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id) || !isUuidLikeString(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
