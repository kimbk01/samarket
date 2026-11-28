/**
 * 어드민 고객센터 실시간 판정 (최종 감사 2026-11-28 D6).
 * 콘솔·벨 브리지가 「이 변경에 다시 읽을지」를 이 함수들로만 정한다 — 읽음 숫자 같은 변경마다 목록을 다시 읽지 않는다.
 */
import type { AdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";
import { ADMIN_SUPPORT_TAB_STATUSES, type AdminSupportTab } from "@/lib/support/support-case-types";

/** 목록 표시에 쓰는 열 — 이 열이 바뀔 때만 목록을 다시 읽는다 */
/** 재감사 D6-b: 빨간 미읽음 숫자(`admin_unread_count`)도 목록에 보이는 값이다 */
const LIST_RELEVANT_FIELDS = ["status", "assigned_admin_id", "last_message_at", "priority", "admin_unread_count"] as const;

/**
 * 점검 M7: 운영 숫자(사이드바·벨 「답변 필요」 수)를 바꿀 수 있는 열 — 목록 열(LIST_RELEVANT_FIELDS)의 일부.
 * 콘솔 목록과 공통 구독(Provider)이 같은 열 이름을 쓴다.
 */
export const SUPPORT_COUNT_RELEVANT_FIELDS = ["status", "assigned_admin_id", "admin_unread_count"] as const satisfies readonly (typeof LIST_RELEVANT_FIELDS)[number][];

type CountSnapshot = Record<(typeof SUPPORT_COUNT_RELEVANT_FIELDS)[number], string>;

/** 문의별 마지막으로 본 숫자 관련 값 — 실시간 old 행은 id 만 오므로 직전 값은 이 표로 비교한다 */
export type SupportCaseCountCache = Map<string, CountSnapshot>;

export const SUPPORT_CASE_COUNT_CACHE_MAX = 500;

export function createSupportCaseCountCache(): SupportCaseCountCache {
  return new Map();
}

/**
 * `support_cases` UPDATE 1건 → 운영 숫자를 다시 읽을지 (점검 M7).
 *  - 처음 보는 문의: 읽는다(직전 값을 모름) · 값을 표에 적는다
 *  - 본 적 있는 문의: 상태·담당·어드민 미읽음 수 중 하나라도 바뀌었을 때만 읽는다
 *  - 페이로드에 그 열이 없으면(부분 행) 바뀐 것으로 보지 않는다
 * 표는 최대 SUPPORT_CASE_COUNT_CACHE_MAX 건 — 넘으면 가장 오래된 것부터 지운다.
 */
export function shouldRefreshSupportCountsForCaseUpdate(
  cache: SupportCaseCountCache,
  newRow: Record<string, unknown> | null | undefined
): boolean {
  const id = norm(newRow?.id).trim();
  if (!id || !newRow) return false;
  const prev = cache.get(id);
  const next = {} as CountSnapshot;
  let changed = !prev;
  for (const f of SUPPORT_COUNT_RELEVANT_FIELDS) {
    if (f in newRow) {
      next[f] = norm(newRow[f]);
      if (prev && prev[f] !== next[f]) changed = true;
    } else {
      next[f] = prev ? prev[f] : "";
    }
  }
  cache.delete(id);
  cache.set(id, next);
  while (cache.size > SUPPORT_CASE_COUNT_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return changed;
}

/**
 * 점검 L13: `support_messages` INSERT 는 공통 구독(AdminStorePointPendingProvider) 한 곳만 받고,
 * 콘솔은 이 창 이벤트로 받는다 — 같은 INSERT 를 브라우저가 2번 받지 않게.
 */
export const ADMIN_SUPPORT_MESSAGE_INSERT_EVENT = "samarket:admin-support-message-insert";

export type AdminSupportMessageInsertDetail = {
  caseId: string;
  senderAdminId: string | null;
};

export function dispatchAdminSupportMessageInsert(detail: AdminSupportMessageInsertDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminSupportMessageInsertDetail>(ADMIN_SUPPORT_MESSAGE_INSERT_EVENT, { detail }));
}

export function subscribeAdminSupportMessageInsert(
  handler: (detail: AdminSupportMessageInsertDetail) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (e: Event) => {
    const d = (e as CustomEvent<AdminSupportMessageInsertDetail>).detail;
    if (d && typeof d.caseId === "string") handler(d);
  };
  window.addEventListener(ADMIN_SUPPORT_MESSAGE_INSERT_EVENT, listener);
  return () => window.removeEventListener(ADMIN_SUPPORT_MESSAGE_INSERT_EVENT, listener);
}

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

/**
 * 재감사 D6-a: 목록에 없는 문의의 UPDATE 가 지금 탭 밖 상태로 바뀐 경우 — 바뀌기 전 상태를 알 수 없어(실시간 old = id 만)
 * 탭 숫자가 달라졌는지 모른다. 즉시 읽지 않고 **느리게(최대 30초에 1번)** 다시 읽어 탭 숫자·전체 수를 맞춘다.
 */
export function isOffListSupportCaseUpdate(input: {
  eventType: string | null | undefined;
  newRow: Record<string, unknown> | null | undefined;
  listed: readonly CaseLike[];
}): boolean {
  if (norm(input.eventType).toUpperCase() !== "UPDATE") return false;
  const id = norm(input.newRow?.id).trim();
  return Boolean(id) && !input.listed.some((c) => c.id === id);
}

export const ADMIN_SUPPORT_OFF_LIST_REFRESH_MS = 30_000;

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
  // 재감사 D6-c: 문의 행 변경은 **보내는 중에만** 건너뛴다(끝나면 patchCase 가 다시 읽음).
  // 끝난 뒤의 메아리는 목록 값과 같아 shouldRefetchSupportListForCaseChange 가 이미 걸러 주고,
  // 다른 어드민의 변경은 그대로 반영된다.
  return w.until === Number.POSITIVE_INFINITY;
}

/** 고객센터 실시간(support_messages·support_cases)을 받을 어드민인가 — 서버 `requireAdminPermission("support")` 와 같은 판정 */
export function adminMeCanReceiveSupportRealtime(me: AdminMeSnapshot | null | undefined): boolean {
  if (!me) return false;
  if (me.role === "super_admin") return true;
  return me.permissions.includes("support");
}
