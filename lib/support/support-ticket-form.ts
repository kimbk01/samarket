/**
 * 고객센터 접수형 문의(티켓) — 한 화면 쓰기 상태·검증·임시 저장 SSOT (Owner 「접수형 1단계」 2026-11-10).
 *
 * - 채팅식 4단계(분야 → 세부 → 안내 → 내용)를 한 화면(분야·세부·관련·내용)으로 합친다.
 * - 문의 접수는 기존 `POST /api/support/cases/open` 그대로(문의 1건 = support_cases, 내용 = 첫 메시지).
 * - 작성 중 내용은 같은 맥락(누가·매장·화면·관련 항목) 단위로 sessionStorage 에 저장 → 다시 열면
 *   「이어 쓰기 / 지우기」. 접수 성공 시 삭제.
 */

import {
  listIssueTypesForCategory,
  listSelectableSupportCategories,
  resolveCanonicalSupportCategoryId,
  type SupportAudience,
  type SupportCategoryDefinition,
} from "@/lib/support/support-category-registry";
import type { SupportContext } from "@/lib/support/support-context";
import { initSupportTriageFromContext } from "@/lib/support/support-triage-model";

export const SUPPORT_TICKET_BODY_MAX = 1000;

/** 매장 없는 회원 전용 분야 — 매장이 있으면 「매장 운영·승인」으로 묻는다. */
export const SUPPORT_TICKET_STORE_LESS_ONLY_CATEGORIES: readonly string[] = ["STORE_PARTNERSHIP"];

/**
 * 고객이 고객센터에서 고를 수 없는 회원 분야 (접수형 2단계 · Owner 2026-11-10).
 * 「주문」(주문 상태·배달 상태·누락·취소)은 매장이 답할 일 → 매장에 문의(주문 채팅).
 * 매장이 답하지 않거나 분쟁이면 「신고 › 매장 신고(주문 분쟁)」로 접수한다.
 * 서버 판정(레지스트리 selectable)은 지난 문의·옛 호출 호환을 위해 그대로 둔다 — 고객 화면 목록에서만 뺀다.
 */
export const SUPPORT_TICKET_HIDDEN_MEMBER_CATEGORIES: readonly string[] = ["ORDER"];

/** 주문 화면에서 여는 고객센터 문의 = 신고 › 매장 신고(주문 분쟁) */
export const SUPPORT_TICKET_STORE_ORDER_CATEGORY = "REPORT" as const;
export const SUPPORT_TICKET_STORE_ORDER_ISSUE = "STORE_ORDER_DISPUTE" as const;

export type SupportTicketFormState = {
  audience: SupportAudience;
  sourceSurface: string;
  storeId?: string;
  category: string | null;
  issueType: string | null;
  /** 맥락 화면(주문 상세·정산 등)에서 연 경우 분야 고정 */
  categoryLocked: boolean;
  explicitOtherSelection: boolean;
  referenceType?: string;
  referenceId?: string;
  referenceTitle?: string;
  /** 주문 화면 — 매장 채팅 주소(표시 전용, 접수 요청에는 넣지 않는다) */
  storeChatHref?: string;
  body: string;
};

export function initSupportTicketForm(context: SupportContext): SupportTicketFormState {
  const t = initSupportTriageFromContext(context);
  const presetIssue =
    t.category && context.issueType && listIssueTypesForCategory(t.category).some((i) => i.id === context.issueType)
      ? context.issueType
      : null;
  return {
    audience: t.audience,
    sourceSurface: t.sourceSurface,
    storeId: t.storeId,
    category: t.category,
    issueType: presetIssue,
    categoryLocked: t.categoryLocked,
    explicitOtherSelection: t.explicitOtherSelection,
    referenceType: t.referenceType,
    referenceId: t.referenceId,
    referenceTitle: t.referenceTitle,
    storeChatHref: context.storeChatHref?.trim() || undefined,
    body: "",
  };
}

/** 주문 문제 안내(「매장에 먼저 문의」) 카드를 보일지 — 회원이 주문 화면에서 연 경우 */
export function isSupportTicketStoreOrderEntry(state: SupportTicketFormState): boolean {
  return state.audience === "MEMBER" && state.referenceType === "STORE_ORDER";
}

/** 분야 목록 — 대상(회원/매장)별 선택 가능 분야, 매장 있는 회원은 「매장 입점 문의」 제외 */
export function listSupportTicketCategories(input: {
  audience: SupportAudience;
  viewerHasStore: boolean;
}): readonly SupportCategoryDefinition[] {
  const all = listSelectableSupportCategories(input.audience);
  if (input.audience !== "MEMBER") return all;
  return all.filter(
    (c) =>
      !SUPPORT_TICKET_HIDDEN_MEMBER_CATEGORIES.includes(c.id) &&
      !(input.viewerHasStore && SUPPORT_TICKET_STORE_LESS_ONLY_CATEGORIES.includes(c.id))
  );
}

export function selectSupportTicketCategory(
  state: SupportTicketFormState,
  categoryId: string
): SupportTicketFormState {
  if (state.categoryLocked) return state;
  const canonical = resolveCanonicalSupportCategoryId(categoryId, state.audience);
  if (!canonical) return state;
  if (!listSelectableSupportCategories(state.audience).some((c) => c.id === canonical)) return state;
  if (canonical === state.category) return state;
  return {
    ...state,
    category: canonical,
    issueType: null,
    explicitOtherSelection: canonical === "OTHER",
  };
}

export function selectSupportTicketIssue(
  state: SupportTicketFormState,
  issueType: string
): SupportTicketFormState {
  if (!state.category) return state;
  if (!listIssueTypesForCategory(state.category).some((i) => i.id === issueType)) return state;
  return { ...state, issueType };
}

export function setSupportTicketBody(state: SupportTicketFormState, value: string): SupportTicketFormState {
  return { ...state, body: value.slice(0, SUPPORT_TICKET_BODY_MAX) };
}

/** 회원 ↔ 매장 전환(허브에서 매장 있는 계정만) — 분야·세부는 대상이 바뀌므로 비운다. 내용은 유지. */
export function switchSupportTicketAudience(
  state: SupportTicketFormState,
  next: { audience: SupportAudience; storeId?: string | null; sourceSurface: string }
): SupportTicketFormState {
  if (state.categoryLocked) return state;
  const storeId = next.audience === "OWNER" ? next.storeId?.trim() || undefined : undefined;
  if (next.audience === state.audience && storeId === state.storeId) return state;
  return {
    ...state,
    audience: next.audience,
    storeId,
    sourceSurface: next.sourceSurface,
    category: null,
    issueType: null,
    explicitOtherSelection: false,
  };
}

export function canSubmitSupportTicket(state: SupportTicketFormState): boolean {
  if (!state.category || !state.issueType) return false;
  if (state.audience === "OWNER" && !state.storeId) return false;
  return state.body.trim().length > 0;
}

export type SupportTicketOpenPayload = {
  context: SupportContext;
  issueType: string;
  initialSummary: string;
  initialBody: string;
  requireIssueType: true;
  explicitOtherSelection: boolean;
};

export function buildSupportTicketOpenPayload(state: SupportTicketFormState): SupportTicketOpenPayload | null {
  if (!canSubmitSupportTicket(state)) return null;
  const body = state.body.trim();
  const context: SupportContext = {
    enabled: true,
    audience: state.audience,
    category: (state.category ?? "") as SupportContext["category"],
    sourceSurface: state.sourceSurface,
    storeId: state.storeId,
    referenceType: state.referenceType,
    referenceId: state.referenceId,
    ...(state.referenceTitle ? { referenceTitle: state.referenceTitle } : {}),
    ...(state.explicitOtherSelection ? { explicitOtherSelection: true } : {}),
  };
  return {
    context,
    issueType: state.issueType!,
    // 고객이 쓴 문장 그대로 — 내부 코드 문자열을 첫 메시지로 넣지 않는다(DEF-19).
    initialSummary: body,
    initialBody: body,
    requireIssueType: true,
    explicitOtherSelection: state.explicitOtherSelection,
  };
}

/* ───────────── 작성 중 임시 저장 (sessionStorage) ───────────── */

const DRAFT_PREFIX = "dibay.support.ticketDraft:";

export type SupportTicketDraft = {
  audience: SupportAudience;
  storeId?: string;
  category: string | null;
  issueType: string | null;
  body: string;
  savedAt: string;
};

/** 같은 맥락이면 같은 키 — 누가·매장·화면·관련 항목 */
export function supportTicketDraftKey(context: SupportContext): string {
  const audience = context.audience === "OWNER" ? "OWNER" : "MEMBER";
  const parts = [
    audience,
    context.storeId?.trim() || "-",
    context.sourceSurface?.trim() || "-",
    context.referenceType?.trim() || "-",
    context.referenceId?.trim() || "-",
  ];
  return `${DRAFT_PREFIX}${parts.join("|")}`;
}

/** 저장할 가치가 있는 내용인지 — 분야만 고른 상태는 저장하지 않는다 */
export function isSupportTicketDraftWorthSaving(state: SupportTicketFormState): boolean {
  return state.body.trim().length > 0;
}

export function readSupportTicketDraft(key: string): SupportTicketDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupportTicketDraft>;
    if (typeof parsed.body !== "string" || !parsed.body.trim()) return null;
    return {
      audience: parsed.audience === "OWNER" ? "OWNER" : "MEMBER",
      storeId: typeof parsed.storeId === "string" ? parsed.storeId : undefined,
      category: typeof parsed.category === "string" ? parsed.category : null,
      issueType: typeof parsed.issueType === "string" ? parsed.issueType : null,
      body: parsed.body.slice(0, SUPPORT_TICKET_BODY_MAX),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeSupportTicketDraft(key: string, state: SupportTicketFormState): void {
  if (typeof window === "undefined") return;
  try {
    if (!isSupportTicketDraftWorthSaving(state)) {
      window.sessionStorage.removeItem(key);
      return;
    }
    const draft: SupportTicketDraft = {
      audience: state.audience,
      storeId: state.storeId,
      category: state.category,
      issueType: state.issueType,
      body: state.body,
      savedAt: new Date().toISOString(),
    };
    window.sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* storage unavailable — 작성은 계속 가능 */
  }
}

export function clearSupportTicketDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** 이어 쓰기 — 저장된 분야·세부·내용을 현재 폼에 적용(대상이 같고 분야 고정과 맞을 때만 분야 적용) */
export function applySupportTicketDraft(
  state: SupportTicketFormState,
  draft: SupportTicketDraft
): SupportTicketFormState {
  let next: SupportTicketFormState = state;
  if (draft.audience === state.audience) {
    if (draft.category && !state.categoryLocked) {
      next = selectSupportTicketCategory(next, draft.category);
    }
    if (draft.issueType && next.category && (!state.categoryLocked || draft.category === state.category)) {
      next = selectSupportTicketIssue(next, draft.issueType);
    }
  }
  return setSupportTicketBody(next, draft.body);
}

/* ───────────── 요청자 화면 상태 ───────────── */

/** 고객·사장님 화면에 보이는 문의 = 진행 중만. 종료(RESOLVED·ARCHIVED)는 목록에서 사라진다. */
export const SUPPORT_TICKET_REQUESTER_VISIBLE_STATUSES = ["OPEN", "WAITING_ADMIN", "WAITING_USER"] as const;

export function isSupportTicketClosedStatus(status: string | null | undefined): boolean {
  return status === "RESOLVED" || status === "ARCHIVED";
}

/** 답변 완료(고객 확인 대기) — 「추가 문의 / 확인했어요」 */
export function isSupportTicketAnsweredStatus(status: string | null | undefined): boolean {
  return status === "WAITING_USER";
}

/** 쓰기 화면 「진행 중인 문의」 최대 줄 수 */
export const SUPPORT_TICKET_ACTIVE_LIST_MAX = 5;

/** 진행 중인 문의 정렬 — 종료 문의 제외, 답변 완료(고객 확인 대기) 먼저, 그다음 최근 순 */
export function sortActiveSupportTickets<T extends { status: string; last_message_at?: string | null }>(
  rows: readonly T[]
): T[] {
  return rows
    .filter((r) => !isSupportTicketClosedStatus(r.status))
    .slice()
    .sort((a, b) => {
      const aa = isSupportTicketAnsweredStatus(a.status) ? 0 : 1;
      const bb = isSupportTicketAnsweredStatus(b.status) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? ""));
    });
}
