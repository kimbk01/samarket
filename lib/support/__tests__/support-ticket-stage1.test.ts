/**
 * 고객센터 접수형 문의 1단계 (Owner 「맞음, 1단계 구현」 2026-11-10) 계약.
 * - 한 화면 쓰기(분야·세부·관련·내용) → 문의 접수 / 작성 중 저장(이어 쓰기·지우기)
 * - 종료 문의는 요청자 화면에서 사라짐 / 고객이 「확인했어요」로 종료(알림 없음)
 * - 숫자는 고객센터 FAB 아이콘에만 · 회원/매장 구분
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildGenericSupportTriageContext,
  buildMemberSupportContext,
  buildOwnerSupportContext,
} from "@/lib/support/support-context";
import {
  SUPPORT_TICKET_BODY_MAX,
  applySupportTicketDraft,
  buildSupportTicketOpenPayload,
  canSubmitSupportTicket,
  clearSupportTicketDraft,
  initSupportTicketForm,
  isSupportTicketAnsweredStatus,
  isSupportTicketClosedStatus,
  listSupportTicketCategories,
  readSupportTicketDraft,
  selectSupportTicketCategory,
  selectSupportTicketIssue,
  setSupportTicketBody,
  supportTicketDraftKey,
  switchSupportTicketAudience,
  writeSupportTicketDraft,
} from "@/lib/support/support-ticket-form";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const hubCtx = () =>
  buildGenericSupportTriageContext({ audience: "MEMBER", sourceSurface: "mypage_customer_center" });

describe("한 화면 쓰기 — 상태·검증", () => {
  it("허브 진입 = 분야 미선택, 내용 비면 접수 불가", () => {
    const s = initSupportTicketForm(hubCtx());
    expect(s.category).toBeNull();
    expect(s.categoryLocked).toBe(false);
    expect(canSubmitSupportTicket(s)).toBe(false);
  });

  it("분야 → 세부 → 내용이 모두 있어야 접수, 분야를 바꾸면 세부는 비운다", () => {
    let s = initSupportTicketForm(hubCtx());
    s = selectSupportTicketCategory(s, "PAYMENT_RECHARGE");
    s = selectSupportTicketIssue(s, "POINT_CHARGE_NOT_REFLECTED");
    expect(canSubmitSupportTicket(s)).toBe(false);
    s = setSupportTicketBody(s, "  충전이 반영 안 됐어요  ");
    expect(canSubmitSupportTicket(s)).toBe(true);
    const p = buildSupportTicketOpenPayload(s)!;
    expect(p.requireIssueType).toBe(true);
    expect(p.issueType).toBe("POINT_CHARGE_NOT_REFLECTED");
    expect(p.initialBody).toBe("충전이 반영 안 됐어요");
    expect(p.initialSummary).toBe("충전이 반영 안 됐어요");
    expect(p.context.audience).toBe("MEMBER");
    s = selectSupportTicketCategory(s, "COUPON");
    expect(s.issueType).toBeNull();
    expect(canSubmitSupportTicket(s)).toBe(false);
  });

  it("세부는 그 분야의 것만, 내용은 최대 길이로 자른다", () => {
    let s = selectSupportTicketCategory(initSupportTicketForm(hubCtx()), "COUPON");
    expect(selectSupportTicketIssue(s, "POINT_CHARGE_NOT_REFLECTED").issueType).toBeNull();
    s = setSupportTicketBody(s, "가".repeat(SUPPORT_TICKET_BODY_MAX + 50));
    expect(s.body.length).toBe(SUPPORT_TICKET_BODY_MAX);
  });

  it("「기타」는 직접 고른 것으로 표시(허브 OTHER 정책)", () => {
    const s = selectSupportTicketCategory(initSupportTicketForm(hubCtx()), "OTHER");
    expect(s.explicitOtherSelection).toBe(true);
  });

  it("맥락 화면(정산 등) = 분야 고정 — 분야를 바꿀 수 없고 대상 전환도 없다", () => {
    const s = initSupportTicketForm(
      buildOwnerSupportContext({ enabled: true, category: "SETTLEMENT", sourceSurface: "owner_settlements", storeId: "st-1" })
    );
    expect(s.categoryLocked).toBe(true);
    expect(s.audience).toBe("OWNER");
    expect(s.storeId).toBe("st-1");
    expect(selectSupportTicketCategory(s, "COUPON")).toBe(s);
    expect(switchSupportTicketAudience(s, { audience: "MEMBER", sourceSurface: "x" })).toBe(s);
  });

  it("매장 있는 회원: 회원 ↔ 매장 전환 시 분야·세부를 비우고 내용은 유지, 매장 문의는 매장 id 필수", () => {
    let s = selectSupportTicketIssue(selectSupportTicketCategory(initSupportTicketForm(hubCtx()), "COUPON"), "OTHER");
    s = setSupportTicketBody(s, "내용");
    const owner = switchSupportTicketAudience(s, { audience: "OWNER", storeId: "st-9", sourceSurface: "owner_customer_center" });
    expect(owner.audience).toBe("OWNER");
    expect(owner.storeId).toBe("st-9");
    expect(owner.category).toBeNull();
    expect(owner.body).toBe("내용");
    const noStore = { ...owner, category: "STORE", issueType: "OTHER", storeId: undefined };
    expect(canSubmitSupportTicket(noStore)).toBe(false);
  });

  it("「매장 입점 문의」는 매장 없는 회원에게만", () => {
    const ids = (hasStore: boolean) =>
      listSupportTicketCategories({ audience: "MEMBER", viewerHasStore: hasStore }).map((c) => c.id);
    expect(ids(false)).toContain("STORE_PARTNERSHIP");
    expect(ids(true)).not.toContain("STORE_PARTNERSHIP");
    expect(listSupportTicketCategories({ audience: "OWNER", viewerHasStore: true }).map((c) => c.id)).toContain("STORE");
  });
});

describe("작성 중 저장 — 이어 쓰기 / 지우기", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("같은 맥락 = 같은 키, 다른 관련 항목·대상 = 다른 키", () => {
    const a = buildMemberSupportContext({ enabled: true, category: "ORDER", sourceSurface: "s", referenceType: "STORE_ORDER", referenceId: "o1" });
    const b = buildMemberSupportContext({ enabled: true, category: "ORDER", sourceSurface: "s", referenceType: "STORE_ORDER", referenceId: "o2" });
    expect(supportTicketDraftKey(a)).toBe(supportTicketDraftKey({ ...a }));
    expect(supportTicketDraftKey(a)).not.toBe(supportTicketDraftKey(b));
    expect(supportTicketDraftKey(hubCtx())).not.toBe(
      supportTicketDraftKey(buildGenericSupportTriageContext({ audience: "OWNER", sourceSurface: "mypage_customer_center", storeId: "st" }))
    );
  });

  it("내용이 있을 때만 저장 → 다시 읽어 이어 쓰기, 지우기 후 없음", () => {
    const key = supportTicketDraftKey(hubCtx());
    let s = initSupportTicketForm(hubCtx());
    s = selectSupportTicketCategory(s, "PAYMENT_RECHARGE");
    writeSupportTicketDraft(key, s);
    expect(readSupportTicketDraft(key)).toBeNull();
    s = selectSupportTicketIssue(s, "POINT_CHARGE_NOT_REFLECTED");
    s = setSupportTicketBody(s, "오후 1시에 충전 신청");
    writeSupportTicketDraft(key, s);
    const d = readSupportTicketDraft(key)!;
    expect(d.body).toBe("오후 1시에 충전 신청");
    const restored = applySupportTicketDraft(initSupportTicketForm(hubCtx()), d);
    expect(restored.category).toBe("PAYMENT_RECHARGE");
    expect(restored.issueType).toBe("POINT_CHARGE_NOT_REFLECTED");
    expect(restored.body).toBe("오후 1시에 충전 신청");
    clearSupportTicketDraft(key);
    expect(readSupportTicketDraft(key)).toBeNull();
  });

  it("화면: 이어 쓰기·지우기 = 같은 너비 버튼 2개, 지우기는 확인 창", () => {
    const v = read("components/support/SupportTicketViews.tsx");
    expect(v).toContain('data-support-ticket-draft-continue="1"');
    expect(v).toContain('data-support-ticket-draft-delete="1"');
    expect(v).toContain('roleTone="destructive"');
    expect(v).toContain("dibayConfirm({");
    expect(v).toContain('t("support_ticket_draft_delete_title")');
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("clearSupportTicketDraft(draftKey)");
  });
});

describe("요청자 화면 — 종료되면 사라짐 · 확인했어요", () => {
  it("상태 판정", () => {
    expect(isSupportTicketClosedStatus("RESOLVED")).toBe(true);
    expect(isSupportTicketClosedStatus("ARCHIVED")).toBe(true);
    expect(isSupportTicketClosedStatus("WAITING_USER")).toBe(false);
    expect(isSupportTicketAnsweredStatus("WAITING_USER")).toBe(true);
    expect(isSupportTicketAnsweredStatus("WAITING_ADMIN")).toBe(false);
  });

  it("목록 API 는 항상 진행 중만, 상세 API 는 종료 문의의 내용을 돌려주지 않는다", () => {
    const list = read("app/api/support/cases/route.ts");
    expect(list).toContain('status: "active",');
    const detail = read("app/api/support/cases/[caseId]/route.ts");
    expect(detail).toContain("isSupportTicketClosedStatus(gate.case.status)");
    expect(detail).toContain("messages: [], closed: true");
    expect(detail).toContain('body.action === "close"');
    expect(detail).toContain("requesterCloseSupportCase");
  });

  it("요청자 종료 = 본인 문의만·CAS·알림 없음·멱등", () => {
    const svc = read("lib/support/support-case-service.ts");
    const fn = svc.slice(
      svc.indexOf("export async function requesterCloseSupportCase"),
      svc.indexOf("export async function markSupportCaseReadForRequester")
    );
    expect(fn).toContain("getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId })");
    expect(fn).toContain('.eq("status", gate.case.status)');
    expect(fn).toContain('payload: { status: "RESOLVED", by: "requester" }');
    expect(fn).not.toContain("notifySupportEvent");
    expect(fn).toMatch(/RESOLVED" \|\| gate\.case\.status === "ARCHIVED"\) \{\s*return \{ ok: true, case: gate\.case \}/);
  });

  it("상세 화면: 답변 완료 = 추가 문의 / 확인했어요, 종료 = 내용 없이 안내 + 새 문의 쓰기, 말풍선 없음", () => {
    const v = read("components/support/SupportTicketViews.tsx");
    expect(v).toContain('data-support-ticket-confirm="1"');
    expect(v).toContain('data-support-ticket-followup-open="1"');
    expect(v).toContain('data-support-ticket-closed="1"');
    expect(v).toContain('t("support_ticket_answer_label")');
    expect(v).not.toContain("support_agent_identity");
    expect(v).not.toContain("max-w-[85%]");
  });
});

describe("고객센터 FAB — 아이콘 숫자 · 회원/매장 구분", () => {
  it("숫자는 헤드폰 아이콘 위, 매장 화면은 갈색·「매장 고객센터」·그 매장 문의만", () => {
    const fab = read("components/support/SupportFab.tsx");
    expect(fab).toMatch(/<Headphones[\s\S]{0,600}data-support-fab-badge="1"/);
    expect(fab).toContain('t("support_fab_owner_label")');
    expect(fab).toContain("bg-[var(--dibay-brown)]");
    expect(fab).toContain("storeId,");
    expect(fab).not.toContain("text-white");
  });

  it("비로그인 = 로그인/회원가입 안내, 돌아올 주소는 next, 맥락은 세션 저장", () => {
    const host = read("components/support/SupportModalHost.tsx");
    expect(host).toContain("SupportTicketLogin");
    expect(host).toContain('setAuth("out")');
    expect(host).toContain("SUPPORT_CONTEXT_SESSION_KEY");
    expect(host).toContain("?next=${encodeURIComponent(next)}");
  });
});
