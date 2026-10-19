/**
 * 커뮤니티 경고·활동 제한 입력 규칙 (설계 §C-0-2 · E-6). 클라이언트·서버 공용 (순수 함수만).
 * 기간: 1·3·7·30일 · 영구(null).
 */
export const COMMUNITY_RESTRICTION_DAY_OPTIONS = [1, 3, 7, 30] as const;
export type CommunityRestrictionScope = "post" | "comment" | "all";
export type CommunitySanctionKind = "warning" | "community_restriction";

export type CommunitySanctionInput = {
  kind: CommunitySanctionKind;
  restriction: CommunityRestrictionScope | null;
  /** null = 영구 (경고는 항상 null) */
  days: number | null;
};

export function parseCommunitySanctionInput(
  raw: unknown
): { ok: true; value: CommunitySanctionInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid_sanction" };
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "").trim();
  if (kind === "warning") return { ok: true, value: { kind: "warning", restriction: null, days: null } };
  if (kind !== "community_restriction") return { ok: false, error: "invalid_kind" };
  const restriction = String(o.restriction ?? "").trim();
  if (restriction !== "post" && restriction !== "comment" && restriction !== "all") {
    return { ok: false, error: "invalid_restriction" };
  }
  let days: number | null = null;
  if (o.days != null && o.days !== "") {
    const n = Number(o.days);
    if (!(COMMUNITY_RESTRICTION_DAY_OPTIONS as readonly number[]).includes(n)) {
      return { ok: false, error: "invalid_days" };
    }
    days = n;
  }
  return { ok: true, value: { kind: "community_restriction", restriction, days } };
}

/** RPC 오류 코드 → HTTP 상태 */
export function communitySanctionRpcErrorStatus(error: string): number {
  if (error === "not_found" || error === "user_not_found") return 404;
  if (error === "conflict" || error === "not_active") return 409;
  if (error === "forbidden") return 500;
  return 400;
}
