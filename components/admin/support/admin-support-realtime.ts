/**
 * 어드민 고객센터 실시간 판정 (최종 감사 2026-11-28 D6).
 * 콘솔·벨 브리지가 「이 변경에 다시 읽을지」를 이 함수들로만 정한다 — 읽음 숫자 같은 변경마다 목록을 다시 읽지 않는다.
 */
import type { AdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { ADMIN_SUPPORT_TAB_STATUSES, type AdminSupportTab } from "@/lib/support/support-case-types";

/** 목록 표시에 쓰는 열 — 이 열이 바뀔 때만 목록을 다시 읽는다 */
const LIST_RELEVANT_FIELDS = ["status", "assigned_admin_id", "last_message_at", "priority"] as const;

type CaseLike = { id: string } & Partial<Record<(typeof LIST_RELEVANT_FIELDS)[number], unknown>>;

function norm(v: unknown): string {
  return v == null ? "" : String(v);
}

/** 같은 시각을 다른 글자로 줄 수 있다(Realtime `+00:00` vs API `Z`) — 시각 열은 숫자로 비교 */
function sameField(field: (typeof LIST_RELEVANT_FIELDS)[number], a: unknown, b: unknown): boolean {
  if (field === "last_message_at") {
    const ta = Date.parse(norm(a));
    const tb = Date.parse(norm(b));
    if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  }
  return norm(a) === norm(b);
}

export function adminSupportTabIncludesStatus(tab: AdminSupportTab, status: string | null | undefined): boolean {
  const statuses = ADMIN_SUPPORT_TAB_STATUSES[tab];
  if (!statuses) return true;
  return (statuses as readonly string[]).includes(norm(status).trim());
}

/**
 * `support_cases` 변경 1건 → 콘솔 목록을 다시 읽을지.
 *  - INSERT: 읽는다
 *  - UPDATE: 목록에 있는 문의면 상태·담당·마지막 글 시각·우선순위가 달라졌을 때만, 목록에 없으면 새 상태가 지금 탭에 속할 때만
 *  - DELETE: 목록에 있던 문의일 때만
 */
export function shouldRefetchSupportListForCaseChange(input: {
  eventType: string | null | undefined;
  newRow: Record<string, unknown> | null | undefined;
  oldRow?: Record<string, unknown> | null | undefined;
  listed: readonly CaseLike[];
  tab: AdminSupportTab;
}): boolean {
  const eventType = norm(input.eventType).toUpperCase();
  if (eventType === "INSERT") return true;
  const id = norm(input.newRow?.id ?? input.oldRow?.id).trim();
  if (!id) return false;
  const inList = input.listed.find((c) => c.id === id);
  if (eventType === "DELETE") return Boolean(inList);
  if (eventType !== "UPDATE") return false;
  const next = input.newRow ?? {};
  if (!inList) return adminSupportTabIncludesStatus(input.tab, norm(next.status));
  return LIST_RELEVANT_FIELDS.some((f) => f in next && !sameField(f, next[f], inList[f]));
}

/** 내가 방금 보낸 변경(답변·상태 등) — patchCase 가 상세·목록을 이미 다시 읽으니 실시간으로 또 읽지 않는다 */
export type AdminSupportOwnWrite = { caseId: string; until: number } | null;

export const ADMIN_SUPPORT_OWN_WRITE_GRACE_MS = 3000;

export function isAdminSupportOwnWriteEcho(input: {
  ownWrite: AdminSupportOwnWrite;
  caseId: string;
  now: number;
  /** support_messages INSERT 면 글쓴 어드민 id — 다른 사람(고객·다른 어드민) 글이면 항상 다시 읽는다 */
  senderAdminId?: string | null;
  selfAdminId?: string | null;
  kind: "message" | "case";
}): boolean {
  const w = input.ownWrite;
  if (!w || !input.caseId || w.caseId !== input.caseId || input.now > w.until) return false;
  if (input.kind === "message") {
    const self = norm(input.selfAdminId).trim();
    return Boolean(self) && norm(input.senderAdminId).trim() === self;
  }
  return true;
}

/** 고객센터 실시간(support_messages·support_cases)을 받을 어드민인가 — 서버 `requireAdminPermission("support")` 와 같은 판정 */
export function adminMeCanReceiveSupportRealtime(me: AdminMeSnapshot | null | undefined): boolean {
  if (!me) return false;
  if (me.role === "super_admin") return true;
  return me.permissions.includes("support");
}
